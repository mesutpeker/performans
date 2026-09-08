(function initPdfParserCore(root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    root.PdfParserCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createPdfParserCore() {
    'use strict';

    const GENDER_PATTERN = /(Erkek|Kız)/iu;
    const GENDER_WORD_PATTERN = /\b(Erkek|Kız)\b/iu;
    const CLASS_PATTERN = /^(.+?)\s*\/\s*([^/]+?)\s*Şubesi(?:\s+(.*))?$/iu;
    const REPORT_TITLE_PATTERN = /\s+(?:Sınıf|Şube)\s*Listesi\s*$/iu;
    const HEADER_PATTERN = /(?:öğrenci\s*no|adı\s*soyadı|sıra\s*no|şube\s*listesi|sınıf\s*listesi)/iu;
    const BOARDING_STATUS_PATTERN = /^(?:yatılı|gündüzlü)$/iu;

    function normalizeSpace(value) {
        return String(value ?? '')
            .replace(/[\t\r\n]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function mergeSpacedLetters(value) {
        const words = normalizeSpace(value).split(' ').filter(Boolean);
        if (words.length < 3) return words.join(' ');

        const result = [];
        let letterRun = [];

        function flushRun() {
            if (letterRun.length >= 3) {
                result.push(letterRun.join(''));
            } else {
                result.push(...letterRun);
            }
            letterRun = [];
        }

        words.forEach(word => {
            if (/^\p{L}$/u.test(word)) {
                letterRun.push(word);
            } else {
                flushRun();
                result.push(word);
            }
        });
        flushRun();

        return result.join(' ');
    }

    function normalizeName(value) {
        const cleaned = normalizeSpace(value)
            .replace(GENDER_WORD_PATTERN, ' ')
            .replace(/[^\p{L}\s'.-]/gu, ' ');
        return mergeSpacedLetters(cleaned).replace(/\s+/g, ' ').trim();
    }

    function normalizeStudentNumber(value) {
        return String(value ?? '').replace(/\D+/g, '');
    }

    function extractClassName(value) {
        const text = normalizeSpace(value);
        const title = text.replace(REPORT_TITLE_PATTERN, '').trim();
        const match = title.match(CLASS_PATTERN);
        if (!match) return title && title !== text ? title : null;

        // Class/program names and branch labels are data, not a fixed vocabulary.
        const classLabel = normalizeSpace(match[1])
            .replace(/(^|\s)(\d{1,2})\s*\.\s*/u, '$1$2. ')
            .replace(/(^|\s)(\d{1,2})\s*\.?\s*Sınıf$/iu, (_, space, grade) => `${space}${Number(grade)}. Sınıf`);
        const branch = normalizeSpace(match[2]).toLocaleUpperCase('tr-TR');
        const detail = normalizeSpace(match[3]);
        return `${classLabel} / ${branch} Şubesi${detail ? ` ${detail}` : ''}`;
    }

    function buildPositionedLines(items, options = {}) {
        const yTolerance = Number(options.yTolerance) || 2.5;
        const columnGap = Number(options.columnGap) || 18;
        const positionedItems = (items || [])
            .filter(item => item && normalizeSpace(item.str))
            .map(item => ({
                str: String(item.str),
                x: Number(item.transform?.[4]) || 0,
                y: Number(item.transform?.[5]) || 0,
                width: Number(item.width) || 0
            }))
            .sort((a, b) => Math.abs(b.y - a.y) > yTolerance ? b.y - a.y : a.x - b.x);

        const rows = [];
        positionedItems.forEach(item => {
            let row = rows.find(candidate => Math.abs(candidate.y - item.y) <= yTolerance);
            if (!row) {
                row = { y: item.y, items: [] };
                rows.push(row);
            }
            row.items.push(item);
        });

        return rows
            .sort((a, b) => b.y - a.y)
            .map(row => {
                row.items.sort((a, b) => a.x - b.x);
                const columns = [];
                let currentColumn = '';
                let previous = null;

                row.items.forEach(item => {
                    if (!previous) {
                        currentColumn = item.str;
                    } else {
                        const gap = item.x - (previous.x + previous.width);
                        if (gap >= columnGap) {
                            columns.push(normalizeSpace(currentColumn));
                            currentColumn = item.str;
                        } else {
                            const separator = gap >= 1.5 ? ' ' : '';
                            currentColumn += separator + item.str;
                        }
                    }
                    previous = item;
                });

                if (currentColumn) columns.push(normalizeSpace(currentColumn));
                const filteredColumns = columns.filter(Boolean);
                return {
                    text: filteredColumns.join('\t'),
                    columns: filteredColumns,
                    y: row.y
                };
            })
            .filter(line => line.columns.length > 0);
    }

    function parseStudentLine(line) {
        const columns = Array.isArray(line?.columns)
            ? line.columns.map(normalizeSpace).filter(Boolean)
            : normalizeSpace(line?.text ?? line).split('\t').map(normalizeSpace).filter(Boolean);
        const rawText = normalizeSpace(line?.text ?? columns.join(' '));

        if (!rawText || HEADER_PATTERN.test(rawText) || !GENDER_PATTERN.test(rawText)) return null;

        let beforeGender = '';
        let afterGender = '';
        let genderColumnIndex = -1;

        for (let index = 0; index < columns.length; index += 1) {
            const genderMatch = columns[index].match(GENDER_PATTERN);
            if (!genderMatch) continue;

            genderColumnIndex = index;
            const genderStart = genderMatch.index ?? 0;
            beforeGender = normalizeSpace([
                ...columns.slice(0, index),
                columns[index].slice(0, genderStart)
            ].join(' '));

            const remainder = normalizeSpace(columns[index].slice(genderStart + genderMatch[0].length));
            const followingColumns = columns.slice(index + 1).map(normalizeSpace).filter(Boolean);
            const following = followingColumns[0] || '';
            const nameBeforeGender = normalizeName(beforeGender.replace(/^.*\d\s*/u, ''));
            // Some e-Okul lists put the full name before gender and boarding status after it.
            const hasNameBeforeGender = nameBeforeGender.split(' ').filter(Boolean).length >= 2;
            const isBoardingColumn = BOARDING_STATUS_PATTERN.test(following) && (remainder || hasNameBeforeGender);
            afterGender = normalizeSpace([remainder, isBoardingColumn ? '' : following].join(' '));
            break;
        }

        if (genderColumnIndex < 0) {
            const genderMatch = rawText.match(GENDER_PATTERN);
            if (!genderMatch) return null;
            const start = genderMatch.index ?? 0;
            beforeGender = rawText.slice(0, start);
            afterGender = rawText.slice(start + genderMatch[0].length);
        }

        const numberMatches = [...beforeGender.matchAll(/\b\d{1,15}\b/g)];
        if (numberMatches.length === 0) return null;

        const studentNumberMatch = numberMatches[numberMatches.length - 1];
        const studentNumber = normalizeStudentNumber(studentNumberMatch[0]);
        const namePart = normalizeName(beforeGender.slice((studentNumberMatch.index ?? 0) + studentNumberMatch[0].length));
        let firstName = namePart;
        let lastName = normalizeName(afterGender);
        let confidence = 'high';
        const warnings = [];

        if (!lastName) {
            const nameWords = namePart.split(' ').filter(Boolean);
            if (nameWords.length < 2) return null;
            lastName = nameWords.pop();
            firstName = nameWords.join(' ');
            confidence = 'medium';
            warnings.push('Soyad, ad alanının son kelimesinden tahmin edildi.');
        }

        if (!studentNumber || !firstName || !lastName) return null;

        return {
            student_no: studentNumber,
            first_name: firstName,
            last_name: lastName,
            confidence,
            warnings,
            source_text: rawText
        };
    }

    function parseLooseStudentLine(line) {
        const rawText = normalizeSpace(line?.text ?? line);
        if (!rawText || HEADER_PATTERN.test(rawText) || extractClassName(rawText)) return null;

        const match = rawText.match(/^\s*\d{1,4}\s+(\d{1,15})\s+(.+)$/u);
        if (!match) return null;

        const studentNumber = normalizeStudentNumber(match[1]);
        const nameText = normalizeName(match[2]);
        const words = nameText.split(' ').filter(Boolean);
        if (!studentNumber || words.length < 2) return null;

        const lastName = words.pop();
        return {
            student_no: studentNumber,
            first_name: words.join(' '),
            last_name: lastName,
            confidence: 'low',
            warnings: ['Satır, yedek ayrıştırma yöntemiyle okundu; kontrol edilmelidir.'],
            source_text: rawText
        };
    }

    function parsePageLines(lines) {
        const primaryStudents = [];
        const warnings = [];

        (lines || []).forEach(line => {
            const student = parseStudentLine(line);
            if (student) primaryStudents.push(student);
        });

        if (primaryStudents.length > 0) {
            return { students: primaryStudents, warnings, usedFallback: false };
        }

        const fallbackStudents = [];
        (lines || []).forEach(line => {
            const student = parseLooseStudentLine(line);
            if (student) fallbackStudents.push(student);
        });

        if (fallbackStudents.length > 0) {
            warnings.push('Sayfadaki öğrenciler yedek ayrıştırma yöntemiyle okundu.');
        }

        return { students: fallbackStudents, warnings, usedFallback: fallbackStudents.length > 0 };
    }

    function deduplicateStudents(students) {
        const byNumber = new Map();
        const issues = [];

        (students || []).forEach(student => {
            const number = normalizeStudentNumber(student.student_no);
            if (!number) {
                issues.push({ type: 'missing-number', message: 'Öğrenci numarası bulunmayan kayıt atlandı.' });
                return;
            }

            const normalizedStudent = { ...student, student_no: number };
            const existing = byNumber.get(number);
            if (!existing) {
                byNumber.set(number, normalizedStudent);
                return;
            }

            const sameName = normalizeSpace(`${existing.first_name} ${existing.last_name}`).toLocaleLowerCase('tr-TR') ===
                normalizeSpace(`${student.first_name} ${student.last_name}`).toLocaleLowerCase('tr-TR');
            issues.push({
                type: sameName ? 'duplicate' : 'conflict',
                student_no: number,
                message: sameName
                    ? `${number} numaralı tekrar eden kayıt birleştirildi.`
                    : `${number} numarasında farklı adlar bulundu; ilk kayıt korundu.`
            });
        });

        return { students: [...byNumber.values()], issues };
    }

    function validateStudents(students) {
        const issues = [];
        const seenNumbers = new Set();

        (students || []).forEach((student, index) => {
            if (!normalizeStudentNumber(student.student_no)) {
                issues.push({ index, field: 'student_no', message: `${index + 1}. kaydın öğrenci numarası eksik.` });
            } else if (seenNumbers.has(student.student_no)) {
                issues.push({ index, field: 'student_no', message: `${student.student_no} numarası birden fazla kayıtta kullanılıyor.` });
            } else {
                seenNumbers.add(student.student_no);
            }

            if (!normalizeName(student.first_name)) {
                issues.push({ index, field: 'first_name', message: `${index + 1}. kaydın adı eksik.` });
            }
            if (!normalizeName(student.last_name)) {
                issues.push({ index, field: 'last_name', message: `${index + 1}. kaydın soyadı eksik.` });
            }
        });

        return issues;
    }

    return {
        buildPositionedLines,
        deduplicateStudents,
        extractClassName,
        mergeSpacedLetters,
        normalizeName,
        normalizeSpace,
        normalizeStudentNumber,
        parseLooseStudentLine,
        parsePageLines,
        parseStudentLine,
        validateStudents
    };
}));
