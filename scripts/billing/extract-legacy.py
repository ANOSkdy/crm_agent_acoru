"""Read the supplied workbook; emit only sanitized migration JSON (never real recipients)."""
import sys, json, zipfile, xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from pathlib import Path

ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(sys.argv[1]) as z:
    strings = []
    if 'xl/sharedStrings.xml' in z.namelist():
        strings = [''.join(t.text or '' for t in e.findall('.//s:t', ns)) for e in ET.fromstring(z.read('xl/sharedStrings.xml'))]
    rels = {e.attrib['Id']: e.attrib['Target'] for e in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    sheets = {}
    for s in ET.fromstring(z.read('xl/workbook.xml')).findall('s:sheets/s:sheet', ns):
        target = rels[s.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
        path = target.lstrip('/') if target.startswith('/') else 'xl/' + target
        rows = []
        for row in ET.fromstring(z.read(path)).findall('s:sheetData/s:row', ns):
            values = {}
            for c in row.findall('s:c', ns):
                col = ''.join(x for x in c.attrib['r'] if x.isalpha())
                v = c.find('s:v', ns)
                value = v.text if v is not None else ''
                if c.attrib.get('t') == 's': value = strings[int(value)]
                elif c.attrib.get('t') == 'inlineStr': value = ''.join(t.text or '' for t in c.findall('.//s:t', ns))
                elif value:
                    try: value = float(value)
                    except ValueError: pass
                values[col] = value
            if any(v != '' for v in values.values()): rows.append(values)
        headers = rows.pop(0)
        sheets[s.attrib['name']] = [{headers[k]: v for k,v in r.items() if k in headers} for r in rows]

def identifier(n): return str(int(n)) if isinstance(n, (float, int)) else str(n)
def day(n): return (datetime(1899,12,30) + timedelta(days=float(n))).date().isoformat()
def lines(customer_id=None, invoice_id=None):
    source = sheets['契約内容'] if customer_id is not None else sheets['請求明細']
    result = []
    for r in source:
        match = identifier(r['顧客ID']) == customer_id if customer_id is not None else r['請求ID'] == invoice_id
        if not match: continue
        quantity, price = r['数量'], r['単価']
        if int(quantity) != quantity or int(price) != price: raise ValueError('Fractional legacy amounts need review')
        if invoice_id and quantity * price != r['金額']: raise ValueError('Legacy line amount mismatch: ' + invoice_id)
        result.append({'name':r['品名'], 'quantity':int(quantity), 'unitPrice':int(price)})
    return result

customers = []
for r in sheets['顧客マスタ']:
    key = identifier(r['顧客ID'])
    customers.append({'id':key,'name':r['会社名'],'email':f'customer-{key}@example.invalid','honorific':r.get('敬称') or '御中','status':r['契約ステータス'],'paymentTerm':r['支払条件'],'lines':lines(customer_id=key)})
master = {c['id']:c for c in customers}
invoices = []
for r in sheets['請求履歴']:
    key = identifier(r['顧客ID']); mismatch = key not in master or master[key]['name'] != r['会社名']
    status = 'sent' if r['ステータス'] == '送信済み' else 'draft' if r['ステータス'] == '未対応' and not mismatch else 'held'
    doc = {'name':r['会社名'],'email':f'legacy-{r["請求ID"]}@example.invalid' if mismatch else master[key]['email'],'honorific':'御中','issueDate':day(r['請求日']),'dueDate':day(r['支払期日']),'lines':lines(invoice_id=r['請求ID']),'imported':True}
    if mismatch: doc['reviewNote'] = '旧顧客IDと現在の会社名が不一致（旧ID: ' + key + '）'
    invoices.append({'id':r['請求ID'],'customer_id':None if mismatch else key,'period':doc['issueDate'][:7],'status':status,'document':doc})
output = {'customers': customers, 'invoices': invoices, 'source': Path(sys.argv[1]).name}
if len(sys.argv) > 3: output['issuer'] = json.loads(Path(sys.argv[3]).read_text(encoding='utf-8'))
Path(sys.argv[2]).parent.mkdir(parents=True, exist_ok=True)
Path(sys.argv[2]).write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'customers':len(customers),'invoices':len(invoices),'recipients':'example.invalid only'}))
