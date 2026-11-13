import os, sqlite3, json, uuid, hmac
from datetime import datetime, timezone
from flask import Flask, request, jsonify
from dfa import compare
from classifier import classify, DEFAULTS

def create_app():
    app = Flask(__name__)
    path = os.environ.get('VALIDATION_DB', '.data/validation.sqlite')
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    def connection():
        con = sqlite3.connect(path, timeout=10)
        con.execute('PRAGMA journal_mode=WAL')
        con.execute('CREATE TABLE IF NOT EXISTS ValidationAudit (validationId TEXT PRIMARY KEY, reportId TEXT, aircraftRegistration TEXT, incidentCode TEXT, dfaResult TEXT, regexResult TEXT, validationStatus TEXT, errorMessage TEXT, timestamp TEXT, originalData TEXT)')
        return con
    with connection(): pass
    @app.before_request
    def authenticate():
        if request.path != '/health':
            key = os.environ.get('SERVICE_TOKEN', '')
            if not key or not hmac.compare_digest(request.headers.get('X-Service-Token',''), key):
                return jsonify(error='Unauthorized service request'), 401
    @app.after_request
    def request_id(response):
        response.headers['X-Request-ID'] = request.headers.get('X-Request-ID', str(uuid.uuid4()))[:100]
        return response
    @app.get('/health')
    def health():
        with connection() as con: con.execute('SELECT 1')
        return jsonify(status='ok')
    @app.post('/validate')
    def validate():
        data = request.get_json(silent=True) or {}
        errors = []
        for field in ['aircraftRegistration','incidentCode','description']:
            if not isinstance(data.get(field), str) or not data[field].strip(): errors.append(f'{field} is required')
        aircraft = compare(str(data.get('aircraftRegistration','')), 'aircraft')
        code = compare(str(data.get('incidentCode','')), 'code')
        if not aircraft['accepted']: errors.append('aircraftRegistration: '+aircraft['reason'])
        if not code['accepted']: errors.append('incidentCode: '+code['reason'])
        if not aircraft['agreement'] or not code['agreement']:
            errors.append('DFA and regex disagreement: validation failed closed')
        try: result = classify(str(data.get('description','')), data.get('keywords'), data.get('urgency','Normal'))
        except ValueError as exc: return jsonify(error=str(exc)), 400
        if not result['category']: errors.append('Description matches no supported incident category; correct the report')
        rules = data.get('businessRules') or {}
        for field, allowed in [('aircraftRegistration', rules.get('supportedAircraft', [])), ('incidentCode', rules.get('supportedCodes', []))]:
            if allowed and data.get(field) not in allowed:
                errors.append(f'{field}: syntactically checked but unsupported by configured business rules')
        mapped = rules.get('aircraftCarriers', {}).get(data.get('aircraftRegistration'))
        if mapped and mapped != data.get('carrierCode'):
            errors.append('Carrier does not match configured aircraft-to-carrier lookup')
        validation_id = str(uuid.uuid4())
        response = {**result, 'validationId':validation_id, 'valid':not errors, 'errors':errors, 'aircraft':aircraft, 'code':code}
        if data.get('audit', True):
            with connection() as con:
                con.execute('INSERT INTO ValidationAudit VALUES (?,?,?,?,?,?,?,?,?,?)', (validation_id, data.get('reportId'),data.get('aircraftRegistration'),data.get('incidentCode'),json.dumps([aircraft,code]),json.dumps([aircraft['regex'],code['regex']]),'Accepted' if not errors else 'Rejected',json.dumps(errors),datetime.now(timezone.utc).isoformat(),json.dumps(data)))
        return jsonify(response)
    @app.post('/audit/link')
    def link():
        data = request.get_json(silent=True) or {}
        if not data.get('validationId') or not data.get('reportId'):
            return jsonify(error='validationId and reportId required'), 400
        with connection() as con:
            result = con.execute('UPDATE ValidationAudit SET reportId=? WHERE validationId=? AND (reportId IS NULL OR reportId=?)', (data['reportId'],data['validationId'],data['reportId']))
            if result.rowcount != 1: return jsonify(error='Audit not found or already linked differently'), 409
        return jsonify(ok=True)
    @app.get('/defaults')
    def defaults(): return jsonify(DEFAULTS)
    return app
app = create_app()
if __name__ == '__main__': app.run(host='127.0.0.1',port=int(os.environ.get('PORT','5001')))
