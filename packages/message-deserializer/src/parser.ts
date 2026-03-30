import type { FieldDefinition, MessageDefinition } from './types.js';

const PRIMITIVE_TYPES = new Set([
  'bool','byte','char','int8','uint8','int16','uint16',
  'int32','uint32','int64','uint64','float32','float64',
  'string','time','duration',
]);

function parseFieldLine(line: string): FieldDefinition | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return null;
  const rawType = parts[0];
  const name = parts[1];
  if (!name || name.includes('=')) return null; // skip constants

  let type = rawType;
  let isArray = false;
  let arrayLength: number | null = null;
  const m = rawType.match(/^(.+?)\[(\d*)\]$/);
  if (m) {
    type = m[1];
    isArray = true;
    arrayLength = m[2] ? parseInt(m[2], 10) : null;
  }
  if (type === 'Header') type = 'std_msgs/Header';
  return { name, type, isArray, arrayLength, isComplex: !PRIMITIVE_TYPES.has(type) };
}

export function parseMessageDefinition(msgDefStr: string): MessageDefinition {
  const SEPARATOR = '================================================================================';
  const sections = msgDefStr.split(SEPARATOR);

  const topLines = sections[0].split('\n');
  let topName = '';
  const topFieldLines: string[] = [];
  for (const line of topLines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    if (!t.includes(' ') && t.includes('/')) { topName = t; continue; }
    topFieldLines.push(t);
  }

  const topDef: MessageDefinition = {
    name: topName,
    fields: topFieldLines.map(parseFieldLine).filter(Boolean) as FieldDefinition[],
    subDefs: new Map(),
  };

  for (let i = 1; i < sections.length; i++) {
    const lines = sections[i].split('\n');
    let subName = '';
    const subFieldLines: string[] = [];
    let foundMsg = false;
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      if (!foundMsg && t.startsWith('MSG:')) {
        subName = t.replace(/^MSG:\s*/, '').trim();
        foundMsg = true;
      } else {
        subFieldLines.push(t);
      }
    }
    if (!subName) continue;
    const subDef: MessageDefinition = {
      name: subName,
      fields: subFieldLines.map(parseFieldLine).filter(Boolean) as FieldDefinition[],
      subDefs: new Map(),
    };
    topDef.subDefs.set(subName, subDef);
    const short = subName.split('/').pop();
    if (short && short !== subName) topDef.subDefs.set(short, subDef);
  }

  return topDef;
}
