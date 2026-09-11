import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FleetImportCsvError, parseCsv, parseFleetImport, readFleetImportFiles } from './fleet-import-csv.js';

const sampleFiles = () => readFleetImportFiles(fileURLToPath(new URL('./fleet-import-sample/', import.meta.url)));

describe('parseCsv', () => {
  it('handles quoted fields, escaped quotes, CRLF and a BOM', () => {
    expect(parseCsv('﻿a,b\r\n1,"x, ""y"""\r\n\r\n2,\n')).toEqual([
      { a: '1', b: 'x, "y"' },
      { a: '2', b: '' },
    ]);
  });
});

describe('parseFleetImport', () => {
  it('parses the committed sample set with codes upper-cased and phones in E.164', async () => {
    const data = parseFleetImport(await sampleFiles());
    expect(data.categories).toHaveLength(4);
    expect(data.machines.map((machine) => machine.code)).toEqual(['KOL220-1', 'JD140-1', 'JD140-2']);
    expect(data.machines[0]).toMatchObject({ year: 2019, registration: null, service_interval_hours: 500 });
    expect(data.machines[1]).toMatchObject({ notes: 'Operator column said "YARD"', next_service_due_hours: null });
    expect(data.implements.map((implement) => implement.code)).toEqual(['BGTA-1', null, 'JD670-1']);
    expect(data.people[0]).toMatchObject({ phone: '+27820000001', role: 'driver' });
    expect(data.people[2]).toMatchObject({ phone: null, role: 'mechanic' });
  });

  it('reports every broken reference at once instead of stopping at the first', async () => {
    const files = await sampleFiles();
    files.machines = `${files.machines}X-1,Bell,1,,,Disc,Sample Mechanic,,,\n`;
    files.implements = `${files.implements}Tractor,,\n`;
    expect(() => parseFleetImport(files)).toThrow(FleetImportCsvError);
    try {
      parseFleetImport(files);
    } catch (error) {
      expect((error as FleetImportCsvError).issues).toEqual([
        'machines.csv line 5: category "Disc" is not a machine category',
        'machines.csv line 5: current_driver "Sample Mechanic" is not a driver in people.csv',
        'implements.csv line 5: category "Tractor" is not an implement category',
      ]);
    }
  });

  it('lets a category name repeat across kinds and resolves each reference by kind', async () => {
    const files = await sampleFiles();
    files.categories = `${files.categories}Trailer,machine,tipper,green\nTrailer,implement,tip-trailer,blue\n`;
    files.machines = `${files.machines}TR-1,Bell,1,,,Trailer,,,,\n`;
    files.implements = `${files.implements}Trailer,TR-2,\n`;
    const data = parseFleetImport(files);
    expect(data.machines.at(-1)?.category).toBe('Trailer');
    expect(data.implements.at(-1)?.category).toBe('Trailer');
  });

  it('rejects two people whose names collapse to the same placeholder email', async () => {
    const files = await sampleFiles();
    files.people = `${files.people}José,driver,\nJose,driver,\n`;
    expect(() => parseFleetImport(files)).toThrow(/placeholder email "jose@fleet.jedidiah.invalid" repeats line 5/);
  });

  it('rejects duplicate codes and names case-insensitively', async () => {
    const files = await sampleFiles();
    files.machines = `${files.machines}jd140-2,Bell,1,,,Tractor,,,,\n`;
    files.people = `${files.people}sample driver one,driver,\n`;
    expect(() => parseFleetImport(files)).toThrow(
      /code "JD140-2" repeats line 4[\s\S]*name "sample driver one" repeats line 2/,
    );
  });

  it('rejects malformed cells with the file and line', async () => {
    const files = await sampleFiles();
    files.categories = `${files.categories}Roller,machine,no-such-icon,pink\n`;
    files.people = `${files.people}Bad Phone,driver,12345\n`;
    expect(() => parseFleetImport(files)).toThrow(
      /categories\.csv line 6: icon[\s\S]*categories\.csv line 6: colour[\s\S]*people\.csv line 5: phone/,
    );
  });
});
