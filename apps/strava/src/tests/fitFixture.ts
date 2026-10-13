// Small, generated FIT course/activity records. No personal activity fixtures.
export function fitFixture(options: { course?: boolean; noGps?: boolean; gap?: boolean; header?: 12 | 14 } = {}): Buffer {
  const fileId = Buffer.from([0x40, 0, 0, 0, 0, 1, 0, 1, 0, 0, options.course ? 6 : 4]);
  const definition = Buffer.from([0x41, 0, 0, 20, 0, 4, 0, 4, 0x85, 1, 4, 0x85, 2, 2, 0x84, 78, 4, 0x86]);
  const points = Array.from({ length: 5 }, (_, i) => {
    const point = Buffer.alloc(15);
    point[0] = 1;
    const missing = options.noGps || (options.gap && i === 2);
    point.writeInt32LE(missing ? 0x7fffffff : Math.round((50 + i / 1000) * 2147483648 / 180), 1);
    point.writeInt32LE(missing ? 0x7fffffff : Math.round((10 + i / 1000) * 2147483648 / 180), 5);
    point.writeUInt16LE((600 + i) * 5, 9);
    point.writeUInt32LE(i === 4 ? 0xffffffff : (700 + i) * 5, 11);
    return point;
  });
  const data = Buffer.concat([fileId, definition, ...points]);
  const header = Buffer.alloc(options.header || 12);
  header[0] = header.length; header[1] = 0x20;
  header.writeUInt16LE(2100, 2); header.writeUInt32LE(data.length, 4);
  header.write('.FIT', 8);
  const beforeCrc = Buffer.concat([header, data]);
  let crc = 0;
  for (const byte of beforeCrc) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  const tail = Buffer.alloc(2); tail.writeUInt16LE(crc);
  return Buffer.concat([beforeCrc, tail]);
}
