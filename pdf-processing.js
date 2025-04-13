// PDF'den sınıf ve öğrenci bilgilerini çıkarma
async function extractClassInfo(pdf) {
    const classes = {};
    const numPages = pdf.numPages;
    
    try {
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            debugLog(`Sayfa ${pageNum}/${numPages} işleniyor...`);
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            debugLog(`Sayfa ${pageNum} - metin öğe sayısı: ${textContent.items.length}`);
            
            // 1. Tüm metin içeriğini birleştirme
            let fullText = '';
            let prevItem = null;
            let lineTexts = [];
            let currentLine = [];
            
            // İlk adımda satırları oluştur
            for (const item of textContent.items) {
                if (prevItem && Math.abs(prevItem.transform[5] - item.transform[5]) < 2) {
                    // Aynı satırda, önceki öğeye ekle
                    currentLine.push(item);
                } else {
                    // Yeni satır başlat
                    if (currentLine.length > 0) {
                        lineTexts.push(currentLine);
                    }
                    currentLine = [item];
                }
                prevItem = item;
            }
            
            // Son satırı ekle
            if (currentLine.length > 0) {
                lineTexts.push(currentLine);
            }
            
            // Her satırı işle ve metne dönüştür
            let lines = [];
            for (const line of lineTexts) {
                // Satırdaki öğeleri x pozisyonuna göre sırala
                line.sort((a, b) => a.transform[4] - b.transform[4]);
                
                let lineText = '';
                let prevLineItem = null;
                
                for (const item of line) {
                    if (prevLineItem) {
                        // Öğeler arasındaki mesafeyi kontrol et
                        const gap = item.transform[4] - (prevLineItem.transform[4] + prevLineItem.width);
                        
                        // Yakın karakterleri birleştir (küçük aralıkları yok say)
                        if (gap < 2) {
                            lineText += item.str;
                        } else if (gap < 20) {
                            // Normal kelime aralığı
                            lineText += ' ' + item.str;
                        } else {
                            // Büyük boşluk, muhtemelen sütun aralığı
                            lineText += '\t' + item.str;
                        }
                    } else {
                        lineText += item.str;
                    }
                    prevLineItem = item;
                }
                
                lines.push(lineText);
                fullText += lineText + '\n';
            }
            
            // Geliştirme modunda metin içeriğini gösterme
            if (debugMode) {
                debugLog(`Sayfa ${pageNum} metin içeriği (ilk 500 karakter):`, fullText.substring(0, 500) + '...');
            }
            
            // 2. Sınıf adını bulma
            const classNamePattern = /(\d+\.\s*Sınıf\s*\/\s*[A-Z]\s*Şubesi.*?)(?:\n|$)/i;
            const classMatch = fullText.match(classNamePattern);
            let currentClass = null;
            
            if (classMatch) {
                currentClass = classMatch[1].trim();
                debugLog(`Sınıf bulundu: ${currentClass}`);
                classes[currentClass] = [];
            } else {
                debugLog(`Sayfa ${pageNum}'de sınıf bilgisi bulunamadı`);
            }
            
            // 3. Öğrenci bilgilerini bulma ve sınıflandırma
            // Öğrenci bilgilerini hem tam metin hem de satır bazında ara
            if (currentClass) {
                // A) Satır bazlı arama (öncelikli)
                let studentsFound = false;
                
                for (const line of lines) {
                    // Tab karakterleri ile ayrılmış alanları içeren satırlar muhtemelen öğrenci satırlarıdır
                    if (line.includes('\t')) {
                        const columns = line.split('\t').map(col => col.trim());
                        
                        // En az 3 sütun var mı kontrol et (numara, isim, soyisim için)
                        if (columns.length >= 3) {
                            // İlk sütun numara mı kontrol et
                            const numberMatch = columns[0].match(/^\s*(\d+)\s*$/);
                            if (numberMatch) {
                                const studentNo = numberMatch[1];
                                
                                // Cinsiyet bilgisini bul (genellikle ayrı bir sütunda)
                                let genderIndex = -1;
                                for (let i = 1; i < columns.length; i++) {
                                    if (/^(Erkek|Kız|erkek|kız)$/i.test(columns[i])) {
                                        genderIndex = i;
                                        break;
                                    }
                                }
                                
                                if (genderIndex > 0) {
                                    // Ad ve soyad için uygun indeksleri belirle
                                    let firstName = columns[1].replace(/\s+/g, ' ').trim();
                                    let lastName = columns[genderIndex + 1] ? columns[genderIndex + 1].replace(/\s+/g, ' ').trim() : '';
                                    
                                    // Soyadı yoksa, ad ve soyadı aynı sütunda olabilir
                                    if (!lastName && firstName.includes(' ')) {
                                        const nameParts = firstName.split(' ');
                                        lastName = nameParts.pop();
                                        firstName = nameParts.join(' ');
                                    }
                                    
                                    if (firstName && lastName) {
                                        // Harfleri düzeltme
                                        firstName = mergeLetters(firstName);
                                        lastName = mergeLetters(lastName);
                                        
                                        classes[currentClass].push({
                                            student_no: studentNo,
                                            first_name: firstName, 
                                            last_name: lastName
                                        });
                                        
                                        studentsFound = true;
                                        
                                        if (debugMode && classes[currentClass].length <= 3) {
                                            debugLog(`Öğrenci bulundu (satır): ${studentNo} ${firstName} ${lastName}`);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                
                // Eğer satır bazlı arama öğrenci bulamadıysa, regex ile dene
                if (!studentsFound) {
                    debugLog(`Satır bazlı arama öğrenci bulamadı, regex ile deneniyor...`);
                    
                    // B) Regex ile arama (yedek yöntem)
                    const studentPattern = /\b(\d+)\s+([A-ZĞÜŞİÖÇÂÎÛa-zğüşıöçâîû\s]+?)\s+(Erkek|Kız|erkek|kız)\s+([A-ZĞÜŞİÖÇÂÎÛa-zğüşıöçâîû\s]+?)\s*(?:\n|$)/g;
                    
                    let match;
                    while ((match = studentPattern.exec(fullText)) !== null) {
                        let firstName = match[2].trim().replace(/\s+/g, ' ');
                        let lastName = match[4].trim().replace(/\s+/g, ' ');
                        
                        // Harfleri düzeltme
                        firstName = mergeLetters(firstName);
                        lastName = mergeLetters(lastName);
                        
                        classes[currentClass].push({
                            student_no: match[1].trim(),
                            first_name: firstName,
                            last_name: lastName
                        });
                        
                        if (debugMode && classes[currentClass].length <= 3) {
                            debugLog(`Öğrenci bulundu (regex): ${match[1].trim()} ${firstName} ${lastName}`);
                        }
                    }
                }
                
                // C) Son çare olarak, daha esnek bir desen dene
                if (classes[currentClass].length === 0) {
                    debugLog(`Standart desenlerle öğrenci bulunamadı, daha esnek desen deneniyor...`);
                    
                    for (const line of lines) {
                        // Başında sayı olan her satırı kontrol et
                        const loosePattern = /^\s*(\d+)\s+(.*)/;
                        const match = line.match(loosePattern);
                        
                        if (match) {
                            const studentNo = match[1].trim();
                            const restOfLine = match[2].trim();
                            
                            // Satırın geri kalanını boşluklara göre parçala
                            const parts = restOfLine.split(/\s+/);
                            
                            if (parts.length >= 2) {
                                // Son kelime soyad olarak kabul et
                                const lastName = parts.pop();
                                // Geri kalan kısım ad olarak kabul et
                                const firstName = parts.join(' ');
                                
                                if (firstName && lastName) {
                                    // Harfleri düzeltme
                                    let correctedFirstName = mergeLetters(firstName);
                                    let correctedLastName = mergeLetters(lastName);
                                    
                                    classes[currentClass].push({
                                        student_no: studentNo,
                                        first_name: correctedFirstName,
                                        last_name: correctedLastName
                                    });
                                    
                                    if (debugMode && classes[currentClass].length <= 3) {
                                        debugLog(`Öğrenci bulundu (esnek desen): ${studentNo} ${correctedFirstName} ${correctedLastName}`);
                                    }
                                }
                            }
                        }
                    }
                }
                
                debugLog(`${currentClass} sınıfında ${classes[currentClass].length} öğrenci bulundu`);
            }
        }
        
        return classes;
    } catch (err) {
        debugLog(`PDF işleme hatası: ${err.message}`);
        throw err;
    }
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