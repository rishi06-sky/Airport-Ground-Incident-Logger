import os, sys, sqlite3, itertools, random
sys.path.insert(0,os.path.dirname(os.path.dirname(__file__)))
from dfa import compare,simulate
from classifier import classify
import pytest
@pytest.mark.parametrize('kind,value,expected', [('aircraft','VT-ABC',True),('aircraft','VT-XYZ',True),('aircraft','VT-AB1',False),('aircraft','VT-AB',False),('aircraft','VT-ABCD',False),('aircraft','vt-abc',False),('aircraft','ABC-XYZ',False),('code','GND123',True),('code','GND001',True),('code','GND999',True),('code','GND12',False),('code','GND1234',False),('code','ABC123',False),('code','GND12A',False),('code','GND123\n',False),('code','GND١٢٣',False)])
def test_identifiers(kind,value,expected):
    r=compare(value,kind)
    assert r['accepted']==expected and r['agreement']

def test_dead_state():
    r=simulate('VX-ABC','aircraft')
    assert [s['state'] for s in r['trace']]==['q0','q1','dead','dead','dead','dead','dead']

def test_equivalence_fuzz():
    random.seed(42)
    for kind in ['aircraft','code']:
        for _ in range(2000):
            value=''.join(random.choices('VT-GNDABC01239\n',k=random.randrange(10)))
            assert compare(value,kind)['agreement']
@pytest.mark.parametrize('description,category',[('debris on apron','FOD'),('collision dent','Damage'),('late departure','Delay'),('restricted area injury','Safety-Breach'),('conveyor breakdown','Equipment-Failure'),('UNSAFE equipment damage','Safety-Breach'),('undamaged predelay','None')])
def test_classification(description,category):
    assert str(classify(description)['category'])==category

def test_priority():
    assert classify('debris',urgency='Critical')['priority']==0
    assert classify('damage')['priority']==1
    assert classify('unsafe damage')['matchedCategories']==['Safety-Breach','Damage']

def test_service_auth_and_audit(tmp_path,monkeypatch):
    monkeypatch.setenv('VALIDATION_DB',str(tmp_path/'audit.sqlite'))
    monkeypatch.setenv('SERVICE_TOKEN','test-internal-key')
    from app import create_app
    client=create_app().test_client()
    assert client.post('/validate',json={}).status_code==401
    response=client.post('/validate',json={'aircraftRegistration':'bad','incidentCode':'GND123','description':'debris'},headers={'X-Service-Token':'test-internal-key'})
    assert not response.json['valid']
    con=sqlite3.connect(tmp_path/'audit.sqlite')
    assert con.execute('select validationStatus from ValidationAudit').fetchone()[0]=='Rejected'
    assert client.get('/health').status_code==200
    preview=client.post('/validate',json={'aircraftRegistration':'VT-ABC','incidentCode':'GND123','description':'debris','audit':False},headers={'X-Service-Token':'test-internal-key'})
    assert preview.json['valid']
    assert con.execute('select count(*) from ValidationAudit').fetchone()[0]==1

def test_health_detects_unwritable_audit_storage(tmp_path,monkeypatch):
    monkeypatch.setenv('VALIDATION_DB',str(tmp_path/'health.sqlite'))
    from app import create_app
    client=create_app().test_client()
    def fail_connect(*args,**kwargs):
        raise sqlite3.OperationalError('database is read-only')
    monkeypatch.setattr(sqlite3,'connect',fail_connect)
    response=client.get('/health')
    assert response.status_code==503
    assert response.json=={'status':'degraded','auditWritable':False}

def test_health_probe_does_not_create_validation_reports_and_audits_survive_service_restart(tmp_path,monkeypatch):
    path=tmp_path/'durable.sqlite'
    monkeypatch.setenv('VALIDATION_DB',str(path))
    monkeypatch.setenv('SERVICE_TOKEN','test-internal-key')
    from app import create_app
    client=create_app().test_client()
    assert client.post('/validate',json={'aircraftRegistration':'VT-ABC','incidentCode':'GND123','description':'debris'},headers={'X-Service-Token':'test-internal-key'}).json['valid']
    restored=create_app().test_client()
    assert restored.get('/health').status_code==200
    assert restored.get('/health').status_code==200
    with sqlite3.connect(path) as con:
        assert con.execute('select count(*) from ValidationAudit').fetchone()[0]==1
        assert con.execute('select count(*) from HealthProbe').fetchone()[0]==1

def test_online_backup_includes_committed_wal_records_and_preserves_original(tmp_path):
    import importlib.util
    from pathlib import Path
    spec=importlib.util.spec_from_file_location('backup_audit',Path(__file__).resolve().parents[1]/'backup_audit.py')
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    source=tmp_path/'source.sqlite'
    target=tmp_path/'snapshot.sqlite'
    with sqlite3.connect(source) as live:
        live.execute('PRAGMA journal_mode=WAL')
        live.execute('CREATE TABLE ValidationAudit (reportId TEXT)')
        live.execute("INSERT INTO ValidationAudit VALUES ('synthetic-audit-backup-test')")
        live.commit()
        module.backup(source,target)
        with sqlite3.connect(target) as restored:
            assert restored.execute('SELECT reportId FROM ValidationAudit').fetchone()[0]=='synthetic-audit-backup-test'
        with pytest.raises(ValueError):module.backup(source,target)
        with pytest.raises(ValueError):module.backup(source,source)
