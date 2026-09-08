// PDF'den sınıf ve öğrenci bilgilerini çıkarma
async function extractClassInfo(pdf) {
    const classes = Object.create(null);
    let currentClass = null;
    let previousRowNumber = null;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
        debugLog(`Sayfa ${pageNum}/${pdf.numPages} işleniyor...`);
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();

        // Okunamayan bir sayfanın ardından öğrencileri önceki sınıfa bağlama.
        if (textContent.items.length === 0) {
            currentClass = null;
            previousRowNumber = null;
            continue;
        }

        const lines = PdfParserCore.buildPositionedLines(textContent.items);
        // Başlık tanınmasa da okunabilir öğrenci satırlarını koru.
        const pageResult = PdfParserCore.parsePageLines(lines);
        const firstStudentIndex = lines.findIndex(line =>
            PdfParserCore.normalizeSpace(line.text) === pageResult.students[0]?.source_text);
        const headerLines = firstStudentIndex >= 0 ? lines.slice(0, firstStudentIndex) : lines;
        const detectedClass = headerLines.map(line => PdfParserCore.extractClassName(line.text)).find(Boolean);
        const hasReportTitle = headerLines.some(line => /(?:Sınıf|Şube)\s*Listesi/iu.test(line.text));
        const firstRowNumber = Number(pageResult.students[0]?.source_text.match(/^(\d+)\s+\d+\s/u)?.[1]) || null;
        const isContinuation = currentClass && !hasReportTitle && previousRowNumber !== null &&
            firstRowNumber === previousRowNumber + 1;

        if (detectedClass) {
            currentClass = detectedClass;
        } else if (!isContinuation) {
            currentClass = `Başlığı okunamayan liste — Sayfa ${pageNum}`;
        }

        // Aynı sınıfın sonraki sayfası önceki öğrencileri silmez.
        classes[currentClass] ||= [];
        pageResult.students.forEach(student => classes[currentClass].push({ ...student, source_page: pageNum }));
        previousRowNumber = Number(pageResult.students.at(-1)?.source_text.match(/^(\d+)\s+\d+\s/u)?.[1]) || null;
        debugLog(`${currentClass}: ${classes[currentClass].length} öğrenci`);
    }

    Object.keys(classes).forEach(className => {
        classes[className] = PdfParserCore.deduplicateStudents(classes[className]).students;
    });
    return classes;
}

// Sınıfları ve öğrencileri görüntüleme
function displayClassesAndStudents(classes) {
    const resultsContainer = document.getElementById('results-container');
    resultsContainer.innerHTML = '';
    
    // Veri önişleme - Öğrenci numarası ve ad kontrolü
    Object.keys(classes).forEach(className => {
        classes[className].forEach(student => {
            // Eğer adın içinde numara varsa ayır
            if (student.first_name && student.first_name.match(/^\d+\s+/)) {
                const parts = student.first_name.trim().split(/\s+/);
                // İlk kelime numaraysa
                if (parts.length > 1 && /^\d+$/.test(parts[0])) {
                    student.student_no = parts[0];
                    // Geri kalan kısmı ad olarak al
                    student.first_name = parts.slice(1).join(' ');
                    debugLog(`Öğrenci verisi düzeltildi: ${student.student_no} - ${student.first_name}`);
                }
            }
        });
    });
    
    // Doğrudan sınıf aktarma butonlarını göster
    const importButtonsContainer = document.createElement('div');
    importButtonsContainer.className = 'mt-3 mb-3 d-flex flex-wrap gap-2';
    importButtonsContainer.innerHTML = '<h5 class="w-100">PDF\'den Öğrencileri Performans Tablosuna Aktar:</h5>';
    
    Object.entries(classes).forEach(([className, students]) => {
        if (students.length === 0) return;
        
        debugLog(`'${className}' sınıfı işlendi, ${students.length} öğrenci var`);
        
        const btn = document.createElement('button');
        btn.className = 'btn btn-success';
        btn.textContent = `${className} Sınıfını Aktar (${students.length} öğrenci)`;
        btn.addEventListener('click', function() {
            importStudentsToPerformanceTable(className);
        });
        importButtonsContainer.appendChild(btn);
    });
    
    resultsContainer.appendChild(importButtonsContainer);
    
    debugLog('Tüm sınıflar başarıyla işlendi ve aktarma butonları oluşturuldu');
}

// Tek bir öğrenci bilgisini kopyalama
function copyStudentInfo(e) {
    const button = e.currentTarget;
    const field = button.getAttribute('data-field');
    const index = button.getAttribute('data-index');
    const className = button.getAttribute('data-class');
    const student = classesByName[className][index];
    
    let textToCopy = '';
    
    if (field === 'all') {
        textToCopy = `${student.student_no} ${student.first_name} ${student.last_name}`;
    } else {
        textToCopy = student[field];
    }
    
    debugLog(`Kopyalanan ${field}: ${textToCopy}`);
    
    navigator.clipboard.writeText(textToCopy).then(() => {
        // Kopyalama başarılı olduğunda butonun stilini değiştirme
        const originalText = button.innerHTML;
        button.innerHTML = '<i class="bi bi-check"></i> Kopyalandı';
        button.classList.remove('btn-outline-secondary');
        button.classList.add('btn-success');
        
        setTimeout(() => {
            button.innerHTML = originalText;
            button.classList.remove('btn-success');
            button.classList.add('btn-outline-secondary');
        }, 1500);
    }).catch(err => {
        debugLog('Kopyalama hatası:', err);
        alert('Kopyalama işlemi başarısız oldu. Tarayıcı izinlerinizi kontrol edin.');
    });
}

// Numaraları kopyalama butonları için olay dinleyicileri
function copyNumbersInfo(e) {
    const button = e.currentTarget;
    const className = button.getAttribute('data-class');
    const students = classesByName[className];
    
    let allNumbers = '';
    
    students.forEach(student => {
        allNumbers += student.student_no + '\n';
    });
    
    debugLog(`'${className}' sınıfının tüm öğrencilerinin numaraları kopyalandı`);
    
    navigator.clipboard.writeText(allNumbers.trim()).then(() => {
        showCopySuccess(button, 'Tüm Numaralar');
    }).catch(err => {
        debugLog('Kopyalama hatası:', err);
        alert('Kopyalama işlemi başarısız oldu. Tarayıcı izinlerinizi kontrol edin.');
    });
}

// Adları kopyalama butonları için olay dinleyicileri
function copyNamesInfo(e) {
    const button = e.currentTarget;
    const className = button.getAttribute('data-class');
    const students = classesByName[className];
    
    let allNames = '';
    
    students.forEach(student => {
        allNames += student.first_name + '\n';
    });
    
    debugLog(`'${className}' sınıfının tüm öğrencilerinin adları kopyalandı`);
    
    navigator.clipboard.writeText(allNames.trim()).then(() => {
        showCopySuccess(button, 'Tüm Adlar');
    }).catch(err => {
        debugLog('Kopyalama hatası:', err);
        alert('Kopyalama işlemi başarısız oldu. Tarayıcı izinlerinizi kontrol edin.');
    });
}

// Soyadları kopyalama butonları için olay dinleyicileri
function copySurnamesInfo(e) {
    const button = e.currentTarget;
    const className = button.getAttribute('data-class');
    const students = classesByName[className];
    
    let allSurnames = '';
    
    students.forEach(student => {
        allSurnames += student.last_name + '\n';
    });
    
    debugLog(`'${className}' sınıfının tüm öğrencilerinin soyadları kopyalandı`);
    
    navigator.clipboard.writeText(allSurnames.trim()).then(() => {
        showCopySuccess(button, 'Tüm Soyadlar');
    }).catch(err => {
        debugLog('Kopyalama hatası:', err);
        alert('Kopyalama işlemi başarısız oldu. Tarayıcı izinlerinizi kontrol edin.');
    });
}

// Ad-Soyadları kopyalama butonları için olay dinleyicileri
function copyFullNamesInfo(e) {
    const button = e.currentTarget;
    const className = button.getAttribute('data-class');
    const students = classesByName[className];
    
    let allFullNames = '';
    
    students.forEach(student => {
        allFullNames += `${student.first_name} ${student.last_name}\n`;
    });
    
    debugLog(`'${className}' sınıfının tüm öğrencilerinin ad-soyadları kopyalandı`);
    
    navigator.clipboard.writeText(allFullNames.trim()).then(() => {
        showCopySuccess(button, 'Tüm Ad-Soyadlar');
    }).catch(err => {
        debugLog('Kopyalama hatası:', err);
        alert('Kopyalama işlemi başarısız oldu. Tarayıcı izinlerinizi kontrol edin.');
    });
}

// Bir sınıfın tüm öğrenci bilgilerini kopyalama
function copyClassInfo(e) {
    const button = e.currentTarget;
    const className = button.getAttribute('data-class');
    const students = classesByName[className];
    
    let allText = '';
    
    students.forEach(student => {
        allText += `${student.student_no} ${student.first_name} ${student.last_name}\n`;
    });
    
    debugLog(`'${className}' sınıfının tüm öğrencileri kopyalandı`);
    
    navigator.clipboard.writeText(allText.trim()).then(() => {
        showCopySuccess(button, 'Tümünü Kopyala');
    }).catch(err => {
        debugLog('Kopyalama hatası:', err);
        alert('Kopyalama işlemi başarısız oldu. Tarayıcı izinlerinizi kontrol edin.');
    });
}

// Kopyalama başarılı olduğunda buton stilini değiştirme
function showCopySuccess(button, originalText) {
    const originalInnerHTML = button.innerHTML;
    const originalClasses = [...button.classList];
    
    // Başarılı metin göster
    button.innerHTML = '<i class="bi bi-check"></i> Kopyalandı';
    
    // Butonun orijinal renk sınıfını belirle
    let buttonColorClass = '';
    if (originalClasses.includes('btn-numbers')) buttonColorClass = 'btn-numbers';
    else if (originalClasses.includes('btn-names')) buttonColorClass = 'btn-names';
    else if (originalClasses.includes('btn-surnames')) buttonColorClass = 'btn-surnames';
    else if (originalClasses.includes('btn-fullnames')) buttonColorClass = 'btn-fullnames';
    else if (originalClasses.includes('btn-all')) buttonColorClass = 'btn-all';
    
    // Orijinal renk sınıfını kaldır ve başarı rengini ekle
    if (buttonColorClass) button.classList.remove(buttonColorClass);
    button.classList.add('btn-success');
    
    setTimeout(() => {
        // Orijinal içeriği ve renk sınıfını geri yükle
        button.innerHTML = originalInnerHTML;
        button.classList.remove('btn-success');
        if (buttonColorClass) button.classList.add(buttonColorClass);
    }, 1500);
}

// Tek bir öğrenci satırının bilgisini kopyalama
function copyRowInfo(e) {
    const button = e.currentTarget;
    const studentInfo = button.getAttribute('data-student');
    
    debugLog(`Kopyalanan öğrenci: ${studentInfo}`);
    
    navigator.clipboard.writeText(studentInfo).then(() => {
        // Kopyalama başarılı olduğunda butonun stilini değiştirme
        const originalHTML = button.innerHTML;
        button.innerHTML = '<i class="bi bi-check"></i>';
        button.style.backgroundColor = 'rgba(40, 167, 69, 0.2)';
        button.style.color = '#28a745';
        
        setTimeout(() => {
            button.innerHTML = originalHTML;
            button.style.backgroundColor = '';
            button.style.color = '';
        }, 1500);
    }).catch(err => {
        debugLog('Kopyalama hatası:', err);
        alert('Kopyalama işlemi başarısız oldu. Tarayıcı izinlerinizi kontrol edin.');
    });
}
