import type { MessageDefinition, FieldDefinition } from './types.js';

type ReadResult<T> = { value: T; offset: number };

function readPrimitive(view: DataView, type: string, offset: number): ReadResult<unknown> {
  switch (type) {
    case 'bool':     return { value: view.getUint8(offset) !== 0, offset: offset + 1 };
    case 'byte': case 'char': case 'uint8': return { value: view.getUint8(offset), offset: offset + 1 };
    case 'int8':     return { value: view.getInt8(offset), offset: offset + 1 };
    case 'uint16':   return { value: view.getUint16(offset, true), offset: offset + 2 };
    case 'int16':    return { value: view.getInt16(offset, true), offset: offset + 2 };
    case 'uint32':   return { value: view.getUint32(offset, true), offset: offset + 4 };
    case 'int32':    return { value: view.getInt32(offset, true), offset: offset + 4 };
    case 'float32':  return { value: view.getFloat32(offset, true), offset: offset + 4 };
    case 'float64':  return { value: view.getFloat64(offset, true), offset: offset + 8 };
    case 'uint64':   return { value: view.getBigUint64(offset, true), offset: offset + 8 };
    case 'int64':    return { value: view.getBigInt64(offset, true), offset: offset + 8 };
    case 'time': case 'duration': {
      const secs = view.getUint32(offset, true);
      const nsecs = view.getUint32(offset + 4, true);
      return { value: { secs, nsecs }, offset: offset + 8 };
    }
    case 'string': {
      const len = view.getUint32(offset, true);
      offset += 4;
      const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, len);
      return { value: new TextDecoder().decode(bytes), offset: offset + len };
    }
    default: throw new Error(`Unknown primitive: ${type}`);
  }
}

function resolveSubDef(type: string, root: MessageDefinition): MessageDefinition {
  if (root.subDefs.has(type)) return root.subDefs.get(type)!;
  const short = type.split('/').pop()!;
  if (root.subDefs.has(short)) return root.subDefs.get(short)!;
  throw new Error(`Unknown message type: ${type}`);
}

const TYPED_ARRAY_MAP: Record<string, { bytes: number; read: (buf: ArrayBuffer, off: number, len: number) => ArrayBufferView }> = {
  float32: { bytes: 4, read: (b, o, l) => new Float32Array(b, o, l) },
  float64: { bytes: 8, read: (b, o, l) => new Float64Array(b, o, l) },
  uint8:   { bytes: 1, read: (b, o, l) => new Uint8Array(b, o, l) },
  byte:    { bytes: 1, read: (b, o, l) => new Uint8Array(b, o, l) },
  int8:    { bytes: 1, read: (b, o, l) => new Int8Array(b, o, l) },
  uint16:  { bytes: 2, read: (b, o, l) => new Uint16Array(b, o, l) },
  int16:   { bytes: 2, read: (b, o, l) => new Int16Array(b, o, l) },
  uint32:  { bytes: 4, read: (b, o, l) => new Uint32Array(b, o, l) },
  int32:   { bytes: 4, read: (b, o, l) => new Int32Array(b, o, l) },
};

function readField(field: FieldDefinition, view: DataView, offset: number, root: MessageDefinition): ReadResult<unknown> {
  const readOne = (off: number): ReadResult<unknown> => {
    if (!field.isComplex) return readPrimitive(view, field.type, off);
    const sub = resolveSubDef(field.type, root);
    return readMessage(sub, view, off, root);
  };

  if (!field.isArray) return readOne(offset);

  let count: number;
  if (field.arrayLength !== null) {
    count = field.arrayLength;
  } else {
    count = view.getUint32(offset, true);
    offset += 4;
  }

  // Use typed arrays for numeric variable-length arrays
  if (!field.isComplex && field.arrayLength === null) {
    const ta = TYPED_ARRAY_MAP[field.type];
    if (ta) {
      const absOff = view.byteOffset + offset;
      let arr: ArrayBufferView;
      if (absOff % ta.bytes === 0) {
        arr = ta.read(view.buffer as ArrayBuffer, absOff, count);
      } else {
        // ROS1 has no alignment padding — copy to aligned buffer
        const copy = (view.buffer as ArrayBuffer).slice(absOff, absOff + count * ta.bytes);
        arr = ta.read(copy, 0, count);
      }
      return { value: arr, offset: offset + count * ta.bytes };
    }
  }

  const arr: unknown[] = [];
  for (let i = 0; i < count; i++) {
    const r = readOne(offset);
    arr.push(r.value);
    offset = r.offset;
  }
  return { value: arr, offset };
}

function readMessage(def: MessageDefinition, view: DataView, offset: number, root: MessageDefinition): ReadResult<Record<string, unknown>> {
  const obj: Record<string, unknown> = {};
  for (const field of def.fields) {
    const r = readField(field, view, offset, root);
    obj[field.name] = r.value;
    offset = r.offset;
  }
  return { value: obj, offset };
}

export function deserializeMessage<T = Record<string, unknown>>(
  def: MessageDefinition,
  buffer: Buffer | Uint8Array,
): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ab: ArrayBuffer = (buffer.buffer as ArrayBuffer).slice(
    buffer.byteOffset, buffer.byteOffset + buffer.byteLength
  ) as any;
  const view = new DataView(ab);
  return readMessage(def, view, 0, def).value as T;
}
