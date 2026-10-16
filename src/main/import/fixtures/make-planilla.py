"""Builds planilla-ejemplo.xlsx: a small, invented copy of the local's spreadsheet for the importer tests.

Same sheets and columns as the real one (PASES, Pagos Pases, Escuelita), with its quirks: dates without a year,
an Excel serial date, a #N/A total, rich text, an inline string, a row without a name, a blank formatted row. Run: python3 make-planilla.py
"""
import datetime
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

SHEETS = {
    'PASES': [
        ['DNI', 'Nombre y Apellido', 'Ficha', 'Fecha Inicio de Pase', 'ASISTENCIA', 'Tipo de Pase', 'PROFE', 'Observacion'],
        ['30111222', ('Ana', ' Roca'), '10.01.26', '12.01.26', 3, 'Libre x8', None, 'Viene los martes'],
        ['30222333', 'Bruno Sierra', '5.02.26', '5.02.26', 2, 'c/Profe x4', 'Fran', None],
        [None, 'Toto', '1.12.26', '3.03.26', 1, 'xDIA Libre', None, 'un capo'],
        ['30333444', 'Carla Méndez', '4.07.23', '2.08', 6, None, None, 'Profe Chiqui'],
        ['30444555', 'Dario Paz', ('serial', datetime.date(2025, 10, 20)), '20.10.25', 4, 'libre x4', None, None],
        ['30555666', 'Eva Luna', '1.09.26', '1.09.26', 1, 'c/Profe x8', None, None],
        [None, None, None, None, 2, None, None, None],
        ['30666777', 'Facundo Gil', '2.09.26', '2.09.26', '5.5', 'Libre x4', 'pipi', None],
        [('inline', 'Hasta aca funcionan las formulas')],
        [('styled',), ('styled',)],
    ],
    'Pagos Pases': [
        ['Fecha', 'DNI', 'Ny A', 'Tipo Pase', 'Cantidad de Pases', 'Pase Indv.', 'Modo de pago', 'Total Pase', 'Profe',
         'Pago Profe', 'Total Profe', 'TOTAL', 'Observaciones', None, None, None, None, 'Tipo Pase', 'Precio Pase', 'Precio Profe'],
        ['3.11.25', '30111222', 'Ana Roca', 'Libre x 8', 1, 51000, 'Efectivo', 51000, None, 0, 0, 51000, None, None, None, None, None, 'Libre x 4', 43000, 0],
        ['10.01.26', '30111222', 'Ana Roca', 'Libre x 8', 1, 51000, 'Transferencia', 51000, None, 0, 0, 51000, None, None, None, None, None, 'Libre x 8', 51000, 0],
        ['5.02.26', None, 'bruno sierra', 'c/Profe x 4', 1, 43000, 'Efectivo', 43000, 'Fran', 7000, 7000, 50000, None, None, None, None, None, 'Libre x 12', 65000, 0],
        ['3.03', None, 'Toto', 'x DIA', 1, 17000, 'Mercado Pago', 17000, None, 0, 0, ('error', '#N/A'), None, None, None, None, None, 'c/Profe x 4', 43000, 27000],
        ['3.08.26', None, 'Juli Soto', 'Escuelita x4', 1, 43000, 'Transferencia', 43000, 'Pipi', 27000, 27000, 70000, None, None, None, None, None, 'c/Profe x 8', 51000, 34000],
        ['2.09.26', '30666777', 'Facu Gil', 'Libre x 4', 1, 43000, 'Debito', 43000, None, 0, 0, 50000, 'mas pedulas', None, None, None, None, 'c/Profe x 12', 65000, 38000],
        [None] * 17 + ['x DIA', 17000, 0],
        [None] * 17 + ['XDIA + Profe', 17000, 13000],
        [None] * 17 + ['Escuelita x DIA', 17000, 13000],
        [None] * 17 + ['Escuelita x4', 43000, 27000],
        [None] * 17 + ['Escuelita x 8', 51000, 34000],
        [None] * 17 + ['Mes x 31', 52000, None],
        [None] * 17 + ['Mes x 40', 62000, None],
    ],
    'Escuelita': [
        ['DNI', 'Nombre y Apellido', 'EDAD', 'Tipo de Pase', 'Ficha', 'Fecha Inicio de Pase', 'ASISTENCIA', 'Observacion'],
        ['55111222', 'Juli Soto', 7, 'Pase x 4', '1.08.26', '3.08.26', 2, 'Mama 3511234567'],
        [None, 'Benja', 6, 'x Dia', None, '5.09.26', 1, None, 'Pago hecho'],
    ],
}

strings: list[str] = []


def shared(text):
    if text not in strings:
        strings.append(text)
    return strings.index(text)


def column(index):
    name = ''
    index += 1
    while index:
        index, rest = divmod(index - 1, 26)
        name = chr(65 + rest) + name
    return name


def cell(ref, value):
    if value is None:
        return ''
    if value == ('styled',):  # formatted but empty, like the real sheet's blank rows
        return f'<c r="{ref}" s="1"/>'
    if isinstance(value, tuple) and value[0] == 'serial':
        return f'<c r="{ref}"><v>{(value[1] - datetime.date(1899, 12, 30)).days}</v></c>'
    if isinstance(value, tuple) and value[0] == 'error':
        return f'<c r="{ref}" t="e"><f>SUM(H5,K5)</f><v>{value[1]}</v></c>'
    if isinstance(value, tuple) and value[0] == 'inline':
        return f'<c r="{ref}" t="inlineStr"><is><t>{escape(value[1])}</t></is></c>'
    if isinstance(value, tuple):  # rich text: one shared string split in runs
        runs = ''.join(f'<r><t xml:space="preserve">{escape(part)}</t></r>' for part in value)
        strings.append(('rich', runs))
        return f'<c r="{ref}" t="s"><v>{len(strings) - 1}</v></c>'
    if isinstance(value, (int, float)):
        return f'<c r="{ref}"><v>{value}</v></c>'
    return f'<c r="{ref}" t="s"><v>{shared(value)}</v></c>'


def sheet_xml(rows):
    body = ''.join(
        f'<row r="{r}">' + ''.join(cell(f'{column(c)}{r}', v) for c, v in enumerate(row)) + '</row>'
        for r, row in enumerate(rows, start=1)
    )
    return f'<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{body}</sheetData></worksheet>'


sheets = {name: sheet_xml(rows) for name, rows in SHEETS.items()}
NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
workbook = f'<?xml version="1.0" encoding="UTF-8"?><workbook {NS}><sheets>' + ''.join(
    f'<sheet name="{escape(name)}" sheetId="{i}" r:id="rId{i}"/>' for i, name in enumerate(sheets, start=1)
) + '</sheets></workbook>'
rels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + ''.join(
    f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>'
    for i in range(1, len(sheets) + 1)
) + '<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>'
items = ''.join(f'<si>{s[1]}</si>' if isinstance(s, tuple) else f'<si><t>{escape(s)}</t></si>' for s in strings)
shared_xml = f'<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="{len(strings)}">{items}</sst>'

out = Path(__file__).with_name('planilla-ejemplo.xlsx')
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
    z.writestr('xl/workbook.xml', workbook)
    z.writestr('xl/_rels/workbook.xml.rels', rels)
    z.writestr('xl/sharedStrings.xml', shared_xml)
    for i, xml in enumerate(sheets.values(), start=1):
        z.writestr(f'xl/worksheets/sheet{i}.xml', xml)
print(out)
