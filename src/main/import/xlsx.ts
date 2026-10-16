import { inflateRawSync } from 'node:zlib';
import { DomainError } from '../../domain/errors';

/** One sheet: row number -> { column letter: cell text }. Rows without any value are left out. */
export type SheetRows = Map<number, Record<string, string>>;

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

// ponytail: plain zip only (store or deflate, no zip64, no encryption): what Excel and LibreOffice write for a
// spreadsheet of a few MB. A bigger or encrypted file fails as INVALID_SPREADSHEET.
function unzip(buffer: Buffer): Map<string, () => Buffer> {
  // The end-of-central-directory record sits in the last 22 bytes plus an optional comment of up to 64 KB.
  let end = -1;
  for (let at = buffer.length - 22; at >= Math.max(0, buffer.length - 22 - 0xffff); at -= 1) {
    if (buffer.readUInt32LE(at) === EOCD) {
      end = at;
      break;
    }
  }
  if (end < 0) throw new DomainError('INVALID_SPREADSHEET');
  const entries = new Map<string, () => Buffer>();
  let at = buffer.readUInt32LE(end + 16);
  for (let index = buffer.readUInt16LE(end + 10); index > 0; index -= 1) {
    if (buffer.readUInt32LE(at) !== CENTRAL) throw new DomainError('INVALID_SPREADSHEET');
    const method = buffer.readUInt16LE(at + 10);
    const size = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const skip = nameLength + buffer.readUInt16LE(at + 30) + buffer.readUInt16LE(at + 32);
    const local = buffer.readUInt32LE(at + 42);
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength);
    entries.set(name, () => {
      if (buffer.readUInt32LE(local) !== LOCAL) throw new DomainError('INVALID_SPREADSHEET');
      const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
      const data = buffer.subarray(start, start + size);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data);
      throw new DomainError('INVALID_SPREADSHEET');
    });
    at += 46 + skip;
  }
  return entries;
}

function decode(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|apos|#x[0-9a-f]+|#\d+);/gi, (_, entity: string) => {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (entity[0] !== '#') return named[entity.toLowerCase()] ?? '';
    return String.fromCodePoint(entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)));
  });
}

function attributes(tag: string): Record<string, string> {
  return Object.fromEntries([...tag.matchAll(/([\w:]+)="([^"]*)"/g)].map(([, key = '', value = '']) => [key, decode(value)]));
}

/** All the <t> texts inside a fragment, joined: a shared string split in rich-text runs, or an inline string. */
function texts(xml: string): string {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(([, text = '']) => decode(text)).join('');
}

function readSheet(xml: string, shared: string[]): SheetRows {
  const rows: SheetRows = new Map();
  // ponytail: rows and cells must carry their `r` reference (Excel and LibreOffice always write it).
  for (const [, rowAttributes = '', body = ''] of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const cells: Record<string, string> = {};
    for (const [, cellAttributes = '', content = ''] of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const { r = '', t } = attributes(cellAttributes);
      const raw = t === 'inlineStr' ? texts(content) : decode(/<v>([\s\S]*?)<\/v>/.exec(content)?.[1] ?? '');
      const text = t === 's' ? (shared[Number(raw)] ?? '') : raw;
      if (text !== '') cells[r.replace(/\d+$/, '')] = text;
    }
    if (Object.keys(cells).length > 0) rows.set(Number(attributes(rowAttributes).r), cells);
  }
  return rows;
}

/** Every sheet of an .xlsx, by name and in workbook order. Formula cells give their cached value. */
export function readWorkbook(buffer: Buffer): Map<string, SheetRows> {
  const entries = unzip(buffer);
  const read = (name: string) => entries.get(name)?.().toString('utf8');
  const workbook = read('xl/workbook.xml');
  const rels = read('xl/_rels/workbook.xml.rels');
  if (!workbook || !rels) throw new DomainError('INVALID_SPREADSHEET');
  const shared = [...(read('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(([, item = '']) => texts(item));
  const targets = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map(([tag]) => [attributes(tag).Id, attributes(tag).Target]));
  const book = new Map<string, SheetRows>();
  for (const [tag] of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const { name = '', 'r:id': id } = attributes(tag);
    const target = targets.get(id) ?? '';
    const xml = read(target.startsWith('/') ? target.slice(1) : `xl/${target}`);
    if (xml) book.set(name, readSheet(xml, shared));
  }
  return book;
}
