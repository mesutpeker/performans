'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const PdfParserCore = require('../pdf-parser-core.js');

function reader() {
    const context = vm.createContext({ PdfParserCore, debugLog() {} });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../pdf-processing.js'), 'utf8'), context);
    return context.extractClassInfo;
}

function textItem(str, x, y) {
    return { str, width: str.length * 4, transform: [1, 0, 0, 1, x, y] };
}

function reportPage(heading, count, firstNumber = 100, firstRow = 1) {
    const items = heading ? [textItem(heading, 20, 740)] : [];
    for (let i = 0; i < count; i++) {
        const y = 700 - i * 20;
        items.push(textItem(`${firstRow + i} ${firstNumber + i} ÖRNEK`, 20, y), textItem('Kız', 250, y), textItem('ÖĞRENCİ', 330, y));
    }
    return { async getTextContent() { return { items }; } };
}

function report(...pages) {
    return { numPages: pages.length, async getPage(number) { return pages[number - 1]; } };
}

function studentCount(classes) {
    return Object.values(classes).reduce((total, students) => total + students.length, 0);
}

test('11 ve 12. sınıflar aynı öğrenci numaralarını içerse de ayrı kalır', async () => {
    const classes = await reader()(report(
        reportPage('ATP - 9. Sınıf / L Şubesi Sınıf Listesi', 16),
        reportPage('ATP - 10. Sınıf / L Şubesi Sınıf Listesi', 14),
        reportPage('ATP - 11. Sınıf / L Şubesi Sınıf Listesi', 11),
        reportPage('ATP - 12. Akademik Destek (Sayısal) / L Şubesi Sınıf Listesi', 20)
    ));
    assert.deepEqual(Object.entries(classes).map(([name, students]) => [name, students.length]), [
        ['ATP - 9. Sınıf / L Şubesi', 16],
        ['ATP - 10. Sınıf / L Şubesi', 14],
        ['ATP - 11. Sınıf / L Şubesi', 11],
        ['ATP - 12. Akademik Destek (Sayısal) / L Şubesi', 20]
    ]);
    assert.equal(studentCount(classes), 61);
    assert.ok(classes['ATP - 11. Sınıf / L Şubesi'].every(student => student.source_page === 3));
    assert.ok(classes['ATP - 12. Akademik Destek (Sayısal) / L Şubesi'].every(student => student.source_page === 4));
});

test('tekrarlanan başlık önceki sayfanın öğrencilerini silmez', async () => {
    const title = '12. Akademik Destek / L Şubesi';
    const classes = await reader()(report(reportPage(title, 2), reportPage(title, 3, 102, 3)));
    assert.deepEqual(Object.keys(classes), [title]);
    assert.equal(classes[title].length, 5);
});

test('başlıksız devam sayfası sıra numaraları devam ediyorsa aynı sınıfa eklenir', async () => {
    const classes = await reader()(report(
        reportPage('Yeni Program / A Şubesi', 2), reportPage(null, 3, 102, 3)
    ));
    assert.deepEqual(Object.keys(classes), ['Yeni Program / A Şubesi']);
    assert.equal(studentCount(classes), 5);
});

test('başlığı okunamayan sayfanın öğrencileri ayrı listede korunur', async () => {
    const classes = await reader()(report(
        reportPage('11. Sınıf / L Şubesi', 2),
        reportPage('Okunamayan Başlık', 3),
        reportPage(null, 2, 103, 4),
        reportPage('12. Akademik Destek / L Şubesi', 4)
    ));
    assert.equal(classes['11. Sınıf / L Şubesi'].length, 2);
    assert.equal(classes['Başlığı okunamayan liste — Sayfa 2'].length, 5);
    assert.equal(classes['12. Akademik Destek / L Şubesi'].length, 4);
    assert.equal(studentCount(classes), 11);
});

test('ilk sayfanın başlığı olmasa da satırlar okunur, sıra yeniden başlarsa birleştirilmez', async () => {
    const classes = await reader()(report(reportPage(null, 2), reportPage(null, 3)));
    assert.equal(classes['Başlığı okunamayan liste — Sayfa 1'].length, 2);
    assert.equal(classes['Başlığı okunamayan liste — Sayfa 2'].length, 3);
});

test('boş veya taranmış sayfa üzerinden önceki sınıfa devam edilmez', async () => {
    const classes = await reader()(report(
        reportPage('11. Sınıf / A Şubesi', 2), reportPage(null, 0), reportPage(null, 2, 102, 3)
    ));
    assert.equal(classes['11. Sınıf / A Şubesi'].length, 2);
    assert.equal(classes['Başlığı okunamayan liste — Sayfa 3'].length, 2);
});

test('farklı programlar, alanlar ve uzun şube adları ayrı tutulur', async () => {
    const titles = [
        'ATP - 11. Sınıf / A Şubesi (BİRİNCİ ALAN)',
        'AMP - 11. Sınıf / A Şubesi (BİRİNCİ ALAN)',
        'AMP - 11. Sınıf / A Şubesi (İKİNCİ ALAN)',
        'Özel Eğitim Uygulama Grubu / UZUN ŞUBE-123 Şubesi',
        'Hazırlık / Ç Şubesi'
    ];
    const classes = await reader()(report(...titles.map(title => reportPage(`${title} Sınıf Listesi`, 2))));
    assert.deepEqual(Object.keys(classes), titles);
    assert.equal(studentCount(classes), 10);
});

test('okul adındaki eğik çizgi sınıf başlığına dahil edilmez', async () => {
    const page = reportPage('12. Yeni Program / B Şubesi Sınıf Listesi', 2);
    const { items } = await page.getTextContent();
    items.unshift(textItem('T.C.', 20, 800), textItem('Başka İlçe / Başka Bir Okul Müdürlüğü', 20, 780));
    const classes = await reader()(report(page));
    assert.deepEqual(Object.keys(classes), ['12. Yeni Program / B Şubesi']);
    assert.equal(studentCount(classes), 2);
});

test('başlık nesne özellikleriyle çakışsa da öğrenciler okunur', async () => {
    const classes = await reader()(report(reportPage('__proto__ Sınıf Listesi', 2), reportPage('constructor Sınıf Listesi', 3)));
    assert.equal(classes.__proto__.length, 2);
    assert.equal(classes.constructor.length, 3);
});
