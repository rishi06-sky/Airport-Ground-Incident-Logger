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
