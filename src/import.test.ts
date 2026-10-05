import { describe, expect, it } from 'vitest';
import {
  findTimes,
  flipSurnameFirst,
  looksSurnameFirst,
  minutesToHHMM,
  parseBellSchedule,
  parseRoster,
  parseStaffList,
  toScheduleBlocks,
  toStudents,
} from './import';

const times = (b: { startTime: string; endTime: string }) => `${b.startTime}-${b.endTime}`;

describe('reading clock times', () => {
  it('reads the usual ways a time is written', () => {
    expect(findTimes('8:00')[0].minutes).toBe(8 * 60);
    expect(findTimes('8:00 AM')[0].minutes).toBe(8 * 60);
    expect(findTimes('1:05 pm')[0].minutes).toBe(13 * 60 + 5);
    expect(findTimes('12:00 AM')[0].minutes).toBe(0);
    expect(findTimes('12:30 PM')[0].minutes).toBe(12 * 60 + 30);
    expect(findTimes('0745 am')[0].minutes).toBe(7 * 60 + 45);
    expect(findTimes('8.05')[0].minutes).toBe(8 * 60 + 5);
  });

  it('finds every time in a line, in order', () => {
    const t = findTimes('1st Period 8:00 - 8:50');
    expect(t).toHaveLength(2);
    expect(t[0].minutes).toBe(480);
    expect(t[1].minutes).toBe(530);
  });

  it('ignores things that are not times', () => {
    expect(findTimes('Room 212')).toHaveLength(0);
    expect(findTimes('Grade 6')).toHaveLength(0);
    expect(findTimes('99:99')).toHaveLength(0);
  });

  it('formats minutes back to a clock', () => {
    expect(minutesToHHMM(480)).toBe('08:00');
    expect(minutesToHHMM(13 * 60 + 5)).toBe('13:05');
  });
});

describe('importing a school bell schedule', () => {
  it('reads a plain middle-school schedule', () => {
    const { blocks, warnings } = parseBellSchedule(`
      Advisory 7:45 - 8:00
      1st Hour 8:03 - 8:51
      2nd Hour 8:55 - 9:43
      3rd Hour 9:47 - 10:35
      Lunch 11:15 - 11:45
      4th Hour 11:49 - 12:37
      5th Hour 12:41 - 1:29
      6th Hour 1:33 - 2:21
      Dismissal 2:25 - 2:35
    `);
    expect(warnings).toEqual([]);
    expect(blocks).toHaveLength(9);
    expect(blocks[0].name).toBe('Advisory');
    expect(times(blocks[0])).toBe('07:45-08:00');
    // Afternoon hours written without "pm" still run forwards.
    expect(times(blocks[6])).toBe('12:41-13:29');
    expect(times(blocks[7])).toBe('13:33-14:21');
    expect(times(blocks[8])).toBe('14:25-14:35');
  });

  it('labels lunch, recess, homeroom, specials and buses', () => {
    const { blocks } = parseBellSchedule(`
      Morning Arrival 7:30-7:45
      Homeroom 7:45-8:00
      Reading 8:00-8:45
      Recess 10:00-10:15
      Lunch 11:30-12:00
      Music 1:00-1:45
      PM Bus Dismissal 2:45-3:00
    `);
    const kinds = Object.fromEntries(blocks.map((b) => [b.name, b.kind]));
    expect(kinds['Morning Arrival']).toBe('bus-dropoff');
    expect(kinds['Homeroom']).toBe('homeroom');
    expect(kinds['Reading']).toBe('period');
    expect(kinds['Recess']).toBe('recess');
    expect(kinds['Lunch']).toBe('lunch');
    expect(kinds['Music']).toBe('specials');
    expect(kinds['PM Bus Dismissal']).toBe('bus-pickup');
  });

  it('reads a comma-separated schedule with am/pm', () => {
    const { blocks } = parseBellSchedule(`
      Period 1,8:00 AM,8:50 AM
      Period 2,8:55 AM,9:45 AM
      Period 7,2:00 PM,2:50 PM
    `);
    expect(blocks).toHaveLength(3);
    expect(blocks[0].name).toBe('Period 1');
    expect(times(blocks[0])).toBe('08:00-08:50');
    expect(times(blocks[2])).toBe('14:00-14:50');
  });

  it('reads a spreadsheet paste with tabs', () => {
    const { blocks } = parseBellSchedule('Homeroom\t7:45\t8:00\nBlock A\t8:00\t9:30\nBlock B\t9:35\t11:05');
    expect(blocks.map((b) => b.name)).toEqual(['Homeroom', 'Block A', 'Block B']);
    expect(times(blocks[2])).toBe('09:35-11:05');
  });

  it('reads times written before the name', () => {
    const { blocks } = parseBellSchedule('8:00-8:50 Homeroom\n8:55-9:45 Math');
    expect(blocks.map((b) => b.name)).toEqual(['Homeroom', 'Math']);
    expect(times(blocks[1])).toBe('08:55-09:45');
  });

  it('fills in the end time when only start times are given', () => {
    const { blocks, warnings } = parseBellSchedule('Period 1 8:00\nPeriod 2 8:55\nPeriod 3 9:50');
    expect(times(blocks[0])).toBe('08:00-08:55');
    expect(times(blocks[1])).toBe('08:55-09:50');
    // The last one has nothing to run into, so it gets a sensible length.
    expect(times(blocks[2])).toBe('09:50-10:35');
    expect(warnings.length).toBe(3);
  });

  it('keeps lines it could not read, rather than dropping them silently', () => {
    const { blocks, skipped } = parseBellSchedule('Sikeston 6th Grade Center\nBell Schedule 2026\nPeriod 1 8:00-8:50');
    expect(blocks).toHaveLength(1);
    expect(skipped).toEqual(['Sikeston 6th Grade Center', 'Bell Schedule 2026']);
  });

  it('numbers repeated names so they can be told apart', () => {
    const { blocks } = parseBellSchedule('Lunch 11:00-11:30\nLunch 11:35-12:05');
    expect(blocks.map((b) => b.name)).toEqual(['Lunch', 'Lunch (2)']);
  });

  it('says so when there are no times at all', () => {
    const { blocks, warnings } = parseBellSchedule('just some words\nand more words');
    expect(blocks).toEqual([]);
    expect(warnings[0]).toMatch(/no times were found/i);
  });

  it('produces blocks the app can use', () => {
    const { blocks } = parseBellSchedule('Period 1 8:00-8:50');
    const real = toScheduleBlocks(blocks);
    expect(real[0].id).toMatch(/^blk/);
    expect(real[0].appliesTo).toBe('all');
    expect(real[0].studentIds).toEqual([]);
  });
});

describe('importing a student roster', () => {
  it('reads a bare column of names', () => {
    const { students } = parseRoster('Marcus Hale\nLily Chen\nJordan Blake');
    expect(students.map((s) => s.name)).toEqual(['Marcus Hale', 'Lily Chen', 'Jordan Blake']);
    expect(students.every((s) => s.dayType === 'full')).toBe(true);
  });

  it('reads a spreadsheet with headings in any order', () => {
    const { students, columns } = parseRoster(
      'Arrival\tStudent Name\tNotes\n11:30 AM\tDylan Reyes\tAfternoon placement\n\tMaya Thompson\tReading support',
    );
    expect(columns).toContain('name');
    expect(columns).toContain('arrival');
    expect(students[0].name).toBe('Dylan Reyes');
    expect(students[0].arrivalTime).toBe('11:30');
    expect(students[0].needsNotes).toBe('Afternoon placement');
    expect(students[1].arrivalTime).toBeUndefined();
  });

  it('joins separate first and last name columns', () => {
    const { students } = parseRoster('First Name,Last Name\nAshley,Brewer\nJordan,Blake');
    expect(students.map((s) => s.name)).toEqual(['Ashley Brewer', 'Jordan Blake']);
  });

  it('spots a surname-first list and can flip it', () => {
    const text = 'Hale, Marcus\nChen, Lily\nBlake, Jordan';
    const detected = parseRoster(text);
    expect(detected.surnameFirst).toBe(true);
    const flipped = parseRoster(text, { flipNames: true });
    expect(flipped.students.map((s) => s.name)).toEqual(['Marcus Hale', 'Lily Chen', 'Jordan Blake']);
  });

  it('does not mistake a normal list for surname-first', () => {
    expect(looksSurnameFirst(['Marcus Hale', 'Lily Chen'])).toBe(false);
    expect(flipSurnameFirst('Marcus Hale')).toBe('Marcus Hale');
  });

  it('reads traits, supports and a 1:1 flag', () => {
    const { students } = parseRoster(
      'Name,Traits,Needs,1:1\nMarcus Hale,aggressive;needs-1to1,behavior,yes\nMaya Thompson,,academic,no',
    );
    expect(students[0].traits).toEqual(['aggressive', 'needs-1to1']);
    expect(students[0].needTags).toEqual(['behavior']);
    expect(students[0].requiresOneToOne).toBe(true);
    expect(students[1].requiresOneToOne).toBe(false);
  });

  it('treats an early departure as a shortened day', () => {
    const { students } = parseRoster('Name,Departure\nJordan Blake,12:15 PM\nMarcus Hale,2:30 PM');
    expect(students[0].dayType).toBe('shortened');
    expect(students[0].departureTime).toBe('12:15');
    expect(students[1].dayType).toBe('full');
  });

  it('reads the word "shortened" in a day column', () => {
    const { students } = parseRoster('Name,Day Type\nSofia Nguyen,Shortened\nIsla Brooks,Full');
    expect(students[0].dayType).toBe('shortened');
    expect(students[1].dayType).toBe('full');
  });

  it('keeps a quoted note containing a comma', () => {
    const { students } = parseRoster('Name,Notes\n"Reyes, Dylan","Arrives late, needs a check-in"');
    expect(students[0].name).toBe('Reyes, Dylan');
    expect(students[0].needsNotes).toBe('Arrives late, needs a check-in');
  });

  it('produces students the app can use', () => {
    const { students } = parseRoster('Marcus Hale');
    const real = toStudents(students);
    expect(real[0].id).toMatch(/^stu/);
    expect(real[0].plan).toEqual([]);
    expect(real[0].coverageMode).toBe('always');
  });

  it('says so when there is nothing to read', () => {
    expect(parseRoster('').warnings[0]).toMatch(/nothing to read/i);
  });
});

describe('importing a staff list', () => {
  it('reads one adult per line', () => {
    const { staff } = parseStaffList('Denise Morales\nKeisha Ward\nTom Alvarez');
    expect(staff).toHaveLength(3);
    expect(staff.every((s) => s.role === 'aide')).toBe(true);
  });

  it('spots the teacher', () => {
    const { staff } = parseStaffList('Ashley Brewer - teacher\nDenise Morales\nKeisha Ward');
    expect(staff[0]).toEqual({ name: 'Ashley Brewer', role: 'teacher' });
    expect(staff[1].role).toBe('aide');
  });

  it('reads a two-column list with roles', () => {
    const { staff } = parseStaffList('Name,Role\nAshley Brewer,Teacher\nDenise Morales,Para');
    expect(staff[0]).toEqual({ name: 'Ashley Brewer', role: 'teacher' });
    expect(staff[1]).toEqual({ name: 'Denise Morales', role: 'aide' });
  });

  it('strips a role written in brackets', () => {
    const { staff } = parseStaffList('Priya Shah (aide)');
    expect(staff[0].name).toBe('Priya Shah');
  });
});
