'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Parser = require('../pdf-parser-core.js');

test('sınıf adını boşluk ve nokta farklılıklarından bağımsız okur', () => {
    assert.equal(Parser.extractClassName('11.Sınıf / d Şubesi'), '11. Sınıf / D Şubesi');
    assert.equal(Parser.extractClassName('4 . Sınıf / ŞA Şubesi'), '4. Sınıf / ŞA Şubesi');
});

test('12. Akademik Destek başlıklarını alanı ve şubesiyle tanır', () => {
    assert.equal(
        Parser.extractClassName('ATP - 12. Akademik Destek (Sayısal) / L Şubesi (ELEKTRİK-ELEKTRONİK TEKNOLOJİSİ ALANI) Sınıf Listesi'),
        'ATP - 12. Akademik Destek (Sayısal) / L Şubesi (ELEKTRİK-ELEKTRONİK TEKNOLOJİSİ ALANI)'
    );
    assert.equal(
        Parser.extractClassName('12 . Akademik\nDestek (Eşit Ağırlık) / ç Şubesi'),
        '12. Akademik Destek (Eşit Ağırlık) / Ç Şubesi'
    );
    assert.equal(Parser.extractClassName('12. Akademik Destek / A Şubesi'), '12. Akademik Destek / A Şubesi');
});

test('program, sınıf ve şube başlıkları sabit bir ad listesiyle sınırlanmaz', () => {
    for (const title of [
        'Hazırlık / A Şubesi',
        'Özel Eğitim Uygulama Grubu / UZUN ŞUBE-123 Şubesi',
        'AMP - 12. Mesleki Eğitim (Yeni Alan) / L Şubesi (BİLİŞİM ALANI)',
        'Farklı Bir Program / Ş Şubesi',
        'İlkokul Destek Grubu'
    ]) {
        assert.equal(Parser.extractClassName(`${title} Sınıf Listesi`), title);
    }
    assert.equal(Parser.extractClassName('İlçe / Başka Bir Okul Müdürlüğü'), null);
});

test('cinsiyetten sonraki ayrı soyad sütununu kullanır', () => {
    const student = Parser.parseStudentLine({ columns: ['1 417 AYŞE NUR', 'Kız', 'YILMAZ'] });
    assert.deepEqual(
        { no: student.student_no, first: student.first_name, last: student.last_name, confidence: student.confidence },
        { no: '417', first: 'AYŞE NUR', last: 'YILMAZ', confidence: 'high' }
    );
});

test('cinsiyetle birleşmiş soyadı ayırır', () => {
    const student = Parser.parseStudentLine({ columns: ['2 418 MEHMET ALİ', 'ErkekKAYA'] });
    assert.equal(student.student_no, '418');
    assert.equal(student.first_name, 'MEHMET ALİ');
    assert.equal(student.last_name, 'KAYA');
});

test('soyad sütunu yoksa kontrollü tahmin yapar', () => {
    const student = Parser.parseStudentLine({ columns: ['3 419 DENİZ ECE AK', 'Kız'] });
    assert.equal(student.first_name, 'DENİZ ECE');
    assert.equal(student.last_name, 'AK');
    assert.equal(student.confidence, 'medium');
    assert.equal(student.warnings.length, 1);
});

test('yedek ayrıştırıcı sıra numarası ile öğrenci numarasını karıştırmaz', () => {
    const student = Parser.parseLooseStudentLine('12 2045 ALİ CAN YILDIRIM');
    assert.equal(student.student_no, '2045');
    assert.equal(student.first_name, 'ALİ CAN');
    assert.equal(student.last_name, 'YILDIRIM');
    assert.equal(student.confidence, 'low');
});

test('yedek yöntem her sayfa için bağımsız çalışır', () => {
    const firstPage = Parser.parsePageLines([{ columns: ['1 100 ADA', 'Kız', 'AK'] }]);
    const secondPage = Parser.parsePageLines([{ text: '2 101 ECE SU ARI', columns: ['2 101 ECE SU ARI'] }]);
    assert.equal(firstPage.students.length, 1);
    assert.equal(secondPage.students.length, 1);
    assert.equal(secondPage.usedFallback, true);
});

test('tekrarlanan öğrenci numaralarını birleştirir ve çakışmayı raporlar', () => {
    const result = Parser.deduplicateStudents([
        { student_no: '10', first_name: 'ADA', last_name: 'AK' },
        { student_no: '10', first_name: 'ADA', last_name: 'AK' },
        { student_no: '10', first_name: 'ECE', last_name: 'ARI' }
    ]);
    assert.equal(result.students.length, 1);
    assert.deepEqual(result.issues.map(issue => issue.type), ['duplicate', 'conflict']);
});

test('liste onay doğrulaması eksik ve tekrarlanan alanları bulur', () => {
    const issues = Parser.validateStudents([
        { student_no: '10', first_name: 'ADA', last_name: 'AK' },
        { student_no: '10', first_name: '', last_name: 'ARI' }
    ]);
    assert.ok(issues.some(issue => issue.field === 'student_no'));
    assert.ok(issues.some(issue => issue.field === 'first_name'));
});

test('konumlandırılmış PDF metnini satır ve sütunlara ayırır', () => {
    const items = [
        { str: 'Kız', transform: [1, 0, 0, 1, 250, 700], width: 15 },
        { str: '1 417 AYŞE NUR', transform: [1, 0, 0, 1, 20, 700], width: 100 },
        { str: 'YILMAZ', transform: [1, 0, 0, 1, 330, 700], width: 40 },
        { str: '11. Sınıf / D Şubesi', transform: [1, 0, 0, 1, 20, 740], width: 130 }
    ];
    const lines = Parser.buildPositionedLines(items);
    assert.equal(lines.length, 2);
    assert.equal(Parser.extractClassName(lines[0].text), '11. Sınıf / D Şubesi');
    assert.equal(Parser.parseStudentLine(lines[1]).student_no, '417');
});

test('ad normalizasyonu HTML işaretlerini veri olarak etkisizleştirir', () => {
    assert.equal(Parser.normalizeName('<img src=x onerror=alert(1)> AYŞE'), 'img src x onerror alert AYŞE');
});


test('yatılılık sütununu cinsiyetten önceki tam ada eklemez', () => {
    for (const status of ['Yatılı', 'Gündüzlü']) {
        const student = Parser.parseStudentLine({ columns: ['1', '417', 'AYŞE NUR', 'KAYA', 'Kız', status] });
        assert.equal(student.first_name, 'AYŞE NUR');
        assert.equal(student.last_name, 'KAYA');
        assert.equal(student.confidence, 'medium');
    }
});

test('cinsiyetle birleşmiş soyada yatılılık sütununu eklemez', () => {
    const student = Parser.parseStudentLine({ columns: ['2 418 MEHMET ALİ', 'ErkekKAYA', 'Yatılı'] });
    assert.equal(student.first_name, 'MEHMET ALİ');
    assert.equal(student.last_name, 'KAYA');
});

test('ayrı soyad sütununu sonraki yatılılık sütunuyla karıştırmaz', () => {
    const student = Parser.parseStudentLine({ columns: ['3 419 AYŞE', 'Kız', 'AK', 'Yatılı'] });
    assert.equal(student.last_name, 'AK');
    const surname = Parser.parseStudentLine({ columns: ['4 420 AYŞE', 'Kız', 'YATILI'] });
    assert.equal(surname.last_name, 'YATILI');
});
