// Builds the "Download my records" PDF: account, plan, starting estimates, and every record,
// laid out as simple tables. Uses PDFKit's built-in Helvetica so no font files are needed.
import PDFDocument from 'pdfkit';
import { calculatePlan, ACTIVITY, JOURNEYS } from '../shared/calculations.js';

const ROSE = '#a85166',
  INK = '#35302f',
  MUTED = '#77706c',
  LINE = '#e9e2db',
  BAND = '#f7f1e9';
const PAGE = { width: 595.28, height: 841.89, margin: 48 }; // A4 in points
const CONTENT = PAGE.width - PAGE.margin * 2;

// The standard PDF fonts only cover Latin-1; anything else becomes a plain substitute
// instead of a broken glyph.
const safe = (value) =>
  String(value ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–/g, '-')
    .replace(/—/g, '--')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '?');
const num = (value, digits = 0) =>
  value == null || Number.isNaN(Number(value)) ? '-' : Number(value).toFixed(digits);
const dateLabel = (value) =>
  new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

export function buildRecordsPdf({ user, profile, entries, generatedAt = new Date() }) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: {
      top: PAGE.margin,
      bottom: PAGE.margin + 18,
      left: PAGE.margin,
      right: PAGE.margin,
    },
    info: { Title: 'U Stay Fit records', Author: 'U Stay Fit', Creator: 'U Stay Fit' },
    bufferPages: true,
  });
  const plan = profile ? calculatePlan(profile) : null;

  const ensureRoom = (height) => {
    if (doc.y + height > PAGE.height - doc.page.margins.bottom) doc.addPage();
  };
  const heading = (text) => {
    ensureRoom(110); // a heading always stays with at least a few lines of its section
    doc.x = PAGE.margin;
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(ROSE).text(safe(text), PAGE.margin);
    doc
      .moveTo(PAGE.margin, doc.y + 3)
      .lineTo(PAGE.margin + CONTENT, doc.y + 3)
      .lineWidth(0.6)
      .strokeColor(LINE)
      .stroke();
    doc.moveDown(0.6);
    doc.font('Helvetica').fontSize(10).fillColor(INK);
  };
  const facts = (pairs) => {
    const labelWidth = 170;
    for (const [label, value] of pairs) {
      doc.font('Helvetica').fontSize(9.5);
      const labelHeight = doc.heightOfString(safe(label), { width: labelWidth - 8 });
      doc.fontSize(10);
      const valueHeight = doc.heightOfString(safe(value), { width: CONTENT - labelWidth });
      const rowHeight = Math.max(14, labelHeight, valueHeight) + 3;
      ensureRoom(rowHeight);
      const y = doc.y;
      doc
        .fontSize(9.5)
        .fillColor(MUTED)
        .text(safe(label), PAGE.margin, y, { width: labelWidth - 8 });
      doc
        .fontSize(10)
        .fillColor(INK)
        .text(safe(value), PAGE.margin + labelWidth, y, { width: CONTENT - labelWidth });
      doc.x = PAGE.margin;
      doc.y = y + rowHeight;
    }
  };
  const table = (columns, rows, emptyText) => {
    if (!rows.length) {
      doc
        .font('Helvetica-Oblique')
        .fontSize(9.5)
        .fillColor(MUTED)
        .text(safe(emptyText), PAGE.margin);
      doc.font('Helvetica').fillColor(INK);
      return;
    }
    const widths = columns.map((c) => Math.round(CONTENT * c.share));
    const drawHeader = () => {
      const y = doc.y;
      doc.rect(PAGE.margin, y - 3, CONTENT, 17).fill(BAND);
      let x = PAGE.margin + 4;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MUTED);
      columns.forEach((column, i) => {
        doc.text(safe(column.title.toUpperCase()), x, y, {
          width: widths[i] - 8,
          align: column.align || 'left',
          lineBreak: false,
        });
        x += widths[i];
      });
      doc.y = y + 17;
      doc.font('Helvetica').fontSize(9.5).fillColor(INK);
    };
    ensureRoom(40);
    drawHeader();
    for (const row of rows) {
      // Measure the tallest cell first so a row never splits across pages.
      const heights = row.map((cell, i) =>
        doc.heightOfString(safe(cell), { width: widths[i] - 8, lineBreak: true }),
      );
      const rowHeight = Math.max(13, ...heights) + 5;
      if (doc.y + rowHeight > PAGE.height - doc.page.margins.bottom) {
        doc.addPage();
        drawHeader();
      }
      const y = doc.y;
      let x = PAGE.margin + 4;
      row.forEach((cell, i) => {
        doc.text(safe(cell), x, y, { width: widths[i] - 8, align: columns[i].align || 'left' });
        x += widths[i];
      });
      doc.y = y + rowHeight;
      doc
        .moveTo(PAGE.margin, doc.y - 2)
        .lineTo(PAGE.margin + CONTENT, doc.y - 2)
        .lineWidth(0.4)
        .strokeColor(LINE)
        .stroke();
    }
    doc.x = PAGE.margin;
    doc.moveDown(0.4);
  };

  // ---- Title block
  doc.font('Helvetica-Bold').fontSize(22).fillColor(INK).text('U Stay Fit', { continued: true });
  doc.fillColor(ROSE).text('.');
  doc
    .font('Helvetica')
    .fontSize(11)
    .fillColor(MUTED)
    .text(
      safe(
        `Your records, exported ${generatedAt.toLocaleDateString('en-US', { dateStyle: 'long' })}`,
      ),
    );
  doc.moveDown(0.3);
  doc
    .fontSize(8.5)
    .text(
      'Everything stored for this account, in one document. Estimates are formula-based general wellness information, not medical advice or measurements.',
      { width: CONTENT },
    );

  // ---- Account
  heading('Account');
  facts([
    ['Name', user.name],
    ['Username', `@${user.username}`],
    ['Email', user.email || 'None (social sign-in)'],
    ['Member since', user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US') : '-'],
    [
      'Privacy consent recorded',
      user.consentedAt ? new Date(user.consentedAt).toLocaleDateString('en-US') : '-',
    ],
    ['Records in this export', String(entries.length)],
  ]);

  // ---- Plan
  heading('Your plan');
  if (!profile) {
    doc.font('Helvetica-Oblique').fillColor(MUTED).text('No plan has been saved yet.');
    doc.font('Helvetica').fillColor(INK);
  } else {
    const journey = JOURNEYS[profile.journey]?.title || profile.journey;
    facts([
      ['Direction', journey],
      ['Starting weight', `${num(profile.weight, 1)} kg`],
      ['Height', `${num(profile.height, 1)} cm`],
      ['Age', `${profile.age} years`],
      ['Equation setting', profile.equationSex === 'male' ? 'Male equation' : 'Female equation'],
      ['Activity', ACTIVITY[profile.activity]?.label || profile.activity],
      [
        'Goal weight',
        ['loss', 'gain'].includes(profile.journey)
          ? `${num(profile.targetWeight, 1)} kg`
          : 'Maintain current weight',
      ],
      ['Timeframe', `${profile.days} days`],
      ['Water reminder', `${profile.waterGoal} ml/day`],
      [
        'Tape measurements',
        profile.neck
          ? `Neck ${num(profile.neck, 1)} cm, waist ${num(profile.waist, 1)} cm${profile.hips ? `, hips ${num(profile.hips, 1)} cm` : ''}`
          : 'Not entered',
      ],
      [
        'Health-data consent',
        profile.consentedAt ? new Date(profile.consentedAt).toLocaleDateString('en-US') : '-',
      ],
    ]);
    heading('Starting estimates');
    facts([
      ['BMI', num(plan.bmi, 1)],
      [
        'Body fat (Deurenberg, from BMI, age, sex)',
        plan.bodyFatBmi != null ? `${num(plan.bodyFatBmi, 1)} %` : 'Not available',
      ],
      [
        'Body fat (tape measurements)',
        plan.bodyFat != null ? `${num(plan.bodyFat, 1)} %` : 'Not entered',
      ],
      [
        'Lean body mass (Boer)',
        plan.leanBodyMass != null
          ? `${num(plan.leanBodyMass, 1)} kg (${num(plan.leanMassPercentage, 1)} % of weight); skeletal muscle about ${num(plan.muscleMassRange[0], 1)}-${num(plan.muscleMassRange[1], 1)} kg`
          : 'Not available',
      ],
      [
        'Protein (multi-compartment model)',
        plan.proteinPercentage != null
          ? `${num(plan.proteinPercentage, 1)} % of weight, about ${num(plan.proteinMass, 1)} kg`
          : 'Not available',
      ],
      ['Resting energy (Mifflin-St Jeor)', `${plan.bmr} kcal/day`],
      ['Maintenance estimate', `${plan.maintenance} kcal/day`],
      [
        'Daily target',
        plan.target != null
          ? `${plan.target} kcal/day (${plan.adjustment >= 0 ? '+' : ''}${plan.adjustment} vs maintenance)`
          : 'Outside the supported range',
      ],
      [
        'Macro starting points',
        `Protein ${plan.protein} g, carbohydrates ${plan.carbs} g, fat ${plan.fat} g per day`,
      ],
    ]);
  }

  // ---- Records
  const byKind = (kind) =>
    entries
      .filter((e) => e.kind === kind)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((e) => ({ ...e.data, date: e.date }));
  const foods = byKind('food'),
    water = byKind('water'),
    exercise = byKind('exercise'),
    weights = byKind('weight');

  heading(`Weight check-ins (${weights.length})`);
  table(
    [
      { title: 'Date', share: 0.16 },
      { title: 'Weight (kg)', share: 0.14, align: 'right' },
      { title: 'Body fat', share: 0.12, align: 'right' },
      { title: 'Muscle', share: 0.12, align: 'right' },
      { title: 'Note', share: 0.46 },
    ],
    weights.map((w) => [
      dateLabel(w.date),
      num(w.weight, 1),
      w.bodyFat != null ? `${num(w.bodyFat, 1)} %` : '-',
      w.muscle != null ? `${num(w.muscle, 1)} %` : '-',
      w.note || '',
    ]),
    'No weight check-ins recorded.',
  );

  heading(`Food (${foods.length})`);
  const foodTotals = foods.reduce(
    (t, f) => ({
      calories: t.calories + Number(f.calories || 0),
      protein: t.protein + Number(f.protein || 0),
    }),
    { calories: 0, protein: 0 },
  );
  if (foods.length)
    doc
      .fontSize(9)
      .fillColor(MUTED)
      .text(
        `Total logged: ${Math.round(foodTotals.calories)} kcal, ${Math.round(foodTotals.protein)} g protein. Protein, carbs, and fat are in grams.`,
      )
      .moveDown(0.3)
      .fillColor(INK);
  table(
    [
      { title: 'Date', share: 0.15 },
      { title: 'Meal', share: 0.12 },
      { title: 'Food', share: 0.31 },
      { title: 'kcal', share: 0.1, align: 'right' },
      { title: 'Protein', share: 0.11, align: 'right' },
      { title: 'Carbs', share: 0.1, align: 'right' },
      { title: 'Fat', share: 0.11, align: 'right' },
    ],
    foods.map((f) => [
      dateLabel(f.date),
      f.meal,
      f.name,
      num(f.calories),
      num(f.protein),
      num(f.carbs),
      num(f.fat),
    ]),
    'No food entries recorded.',
  );

  heading(`Water (${water.length})`);
  table(
    [
      { title: 'Date', share: 0.3 },
      { title: 'Amount (ml)', share: 0.2, align: 'right' },
      { title: '', share: 0.5 },
    ],
    water.map((w) => [dateLabel(w.date), num(w.amount), '']),
    'No water entries recorded.',
  );

  heading(`Exercise (${exercise.length})`);
  table(
    [
      { title: 'Date', share: 0.18 },
      { title: 'Activity', share: 0.46 },
      { title: 'Minutes', share: 0.16, align: 'right' },
      { title: 'Est. kcal', share: 0.2, align: 'right' },
    ],
    exercise.map((e) => [dateLabel(e.date), e.name, num(e.minutes), num(e.calories)]),
    'No exercise entries recorded.',
  );

  // ---- Footer on every page. It sits inside the bottom margin, so the margin is lifted while
  // it is drawn; otherwise PDFKit would treat the footer as overflow and add blank pages.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUTED)
      .text(
        safe(`U Stay Fit - ${user.email || '@' + user.username} - page ${i + 1} of ${range.count}`),
        PAGE.margin,
        PAGE.height - PAGE.margin + 16,
        { width: CONTENT, align: 'center', lineBreak: false },
      );
    doc.page.margins.bottom = bottom;
  }
  doc.end();
  return doc;
}
