// Not Dağılımı İşlevleri

// Global değişkenler
let generatedGrades = {};
let currentClassName = '';

// Normal dağılım için rastgele sayı üreteci
function normalRandom(mean, stdDev, min, max, seed) {
    // Seed kullanarak rastgele sayı üreteci
    const randomGenerator = new PseudoRandom(seed);
    
    // Box-Muller dönüşümüyle normal dağılımlı rastgele sayı üretme
    let u1, u2, z0;
    u1 = randomGenerator.random();
    u2 = randomGenerator.random();
    
    // Box-Muller dönüşümü
    z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    
    // İstenen ortalama ve standart sapmaya dönüştürme
    let result = z0 * stdDev + mean;
    
    // Min ve max aralığına sınırlama
    result = Math.max(min, Math.min(max, result));
    
    return result;
}

// Tekrarlanabilir rastgele sayı üreteci
class PseudoRandom {
    constructor(seed) {
        this.seed = seed || 42;
    }
    
    // Basit LCG (Linear Congruential Generator)
    random() {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }
    
    // Belirli bir aralıkta rastgele tamsayı
    randomInt(min, max) {
        return Math.floor(this.random() * (max - min + 1)) + min;
    }
}

// Not harfi hesaplama
function calculateLetterGrade(score, distribution) {
    if (score >= distribution.a) return 'A';
    if (score >= distribution.b) return 'B';
    if (score >= distribution.c) return 'C';
    if (score >= distribution.d) return 'D';
    return 'F';
}

// Sınıf için not dağılımını hesaplama
function calculateGradeDistribution(students, distributionType, customDistribution) {
    const totalStudents = students.length;
    let gradeThresholds = {};
    
    if (distributionType === 'normal') {
        // Normal dağılım için eşik değerleri
        gradeThresholds = {
            a: 85,
            b: 70,
            c: 55,
            d: 40,
            f: 0
        };
    } else if (distributionType === 'uniform') {
        // Eşit dağılım (aralıklar eşit)
        gradeThresholds = {
            a: 80,
            b: 60,
            c: 40,
            d: 20,
            f: 0
        };
    } else if (distributionType === 'custom') {
        // Özel dağılım için öğrenci sayılarını hesaplama
        const aCount = Math.round(totalStudents * (customDistribution.a / 100));
        const bCount = Math.round(totalStudents * (customDistribution.b / 100));
        const cCount = Math.round(totalStudents * (customDistribution.c / 100));
        const dCount = Math.round(totalStudents * (customDistribution.d / 100));
        
        // Özel dağılım için not eşiklerini hesaplama (varsayılan değerler)
        gradeThresholds = {
            a: 90,
            b: 80,
            c: 65,
            d: 50,
            f: 0
        };
    }
    
    return gradeThresholds;
}

// Notları oluştur
function generateGrades() {
    const className = document.getElementById('grade-class-select').value;
    
    if (!className) {
        alert('Lütfen bir sınıf seçin!');
        return;
    }
    
    currentClassName = className;
    const students = classesByName[className];
    
    if (!students || students.length === 0) {
        alert('Seçilen sınıfta öğrenci bulunamadı!');
        return;
    }
    
    // Not dağılımı parametrelerini al
    const distributionType = document.getElementById('distribution-type').value;
    const minScore = parseInt(document.getElementById('min-score').value) || 0;
    const maxScore = parseInt(document.getElementById('max-score').value) || 100;
    const seed = parseInt(document.getElementById('seed-value').value) || 42;
    const examWeight = parseInt(document.getElementById('exam-weight').value) || 100;
    
    // Özel dağılım için parametreler
    const customDistribution = {
        a: parseInt(document.getElementById('grade-a-percentage').value) || 10,
        b: parseInt(document.getElementById('grade-b-percentage').value) || 20,
        c: parseInt(document.getElementById('grade-c-percentage').value) || 40,
        d: parseInt(document.getElementById('grade-d-percentage').value) || 20, 
        f: parseInt(document.getElementById('grade-f-percentage').value) || 10
    };
    
    // Toplam yüzde 100 olmalı
    const totalPercentage = customDistribution.a + customDistribution.b + 
                           customDistribution.c + customDistribution.d + 
                           customDistribution.f;
    
    if (distributionType === 'custom' && totalPercentage !== 100) {
        alert('Özel dağılım yüzdeleri toplamı 100 olmalıdır!');
        return;
    }
    
    // Not dağılımını hesapla
    const gradeThresholds = calculateGradeDistribution(students, distributionType, customDistribution);
    
    // Rastgele sayı üreteci
    const random = new PseudoRandom(seed);
    
    // Her öğrenci için not oluştur
    generatedGrades[className] = students.map(student => {
        let score;
        
        if (distributionType === 'normal') {
            // Normal dağılım (ortalama 65, standart sapma 15)
            score = normalRandom(65, 15, minScore, maxScore, random.randomInt(1, 10000));
        } else if (distributionType === 'uniform') {
            // Eşit dağılım
            score = random.randomInt(minScore, maxScore);
        } else {
            // Özel dağılım
            score = random.randomInt(minScore, maxScore);
        }
        
        // Sayıyı tam sayıya yuvarla
        score = Math.round(score);
        
        // Harf notunu hesapla
        const letterGrade = calculateLetterGrade(score, gradeThresholds);
        
        // Öğrenci bilgilerini ve not bilgisini döndür
        return {
            ...student,
            score,
            letter_grade: letterGrade
        };
    });
    
    // Sonuçları göster
    displayGradeResults(generatedGrades[className], className);
    
    // Excel'e aktarma düğmesini etkinleştir
    document.getElementById('export-grades-btn').disabled = false;
}

// Not sonuçlarını görüntüleme
function displayGradeResults(studentsWithGrades, className) {
    const resultsContainer = document.getElementById('grade-results-container');
    resultsContainer.innerHTML = '';
    
    // İstatistikleri hesapla
    const totalStudents = studentsWithGrades.length;
    const avgScore = studentsWithGrades.reduce((sum, student) => sum + student.score, 0) / totalStudents;
    
    // Harf notlarına göre gruplandırma
    const gradeDistribution = {
        A: 0, B: 0, C: 0, D: 0, F: 0
    };
    
    studentsWithGrades.forEach(student => {
        gradeDistribution[student.letter_grade]++;
    });
    
    // İstatistik kartı
    const statsCard = document.createElement('div');
    statsCard.className = 'card mb-4';
    statsCard.innerHTML = `
        <div class="card-header bg-primary text-white">
            <h5>${className} - Not Dağılımı İstatistikleri</h5>
        </div>
        <div class="card-body">
            <div class="row">
                <div class="col-md-6">
                    <p><strong>Toplam Öğrenci:</strong> ${totalStudents}</p>
                    <p><strong>Ortalama Puan:</strong> ${avgScore.toFixed(2)}</p>
                </div>
                <div class="col-md-6">
                    <p><strong>Harf Notu Dağılımı:</strong></p>
                    <ul class="list-group">
                        <li class="list-group-item d-flex justify-content-between align-items-center">
                            A
                            <span class="badge bg-primary rounded-pill">${gradeDistribution.A} (${((gradeDistribution.A / totalStudents) * 100).toFixed(1)}%)</span>
                        </li>
                        <li class="list-group-item d-flex justify-content-between align-items-center">
                            B
                            <span class="badge bg-success rounded-pill">${gradeDistribution.B} (${((gradeDistribution.B / totalStudents) * 100).toFixed(1)}%)</span>
                        </li>
                        <li class="list-group-item d-flex justify-content-between align-items-center">
                            C
                            <span class="badge bg-info rounded-pill">${gradeDistribution.C} (${((gradeDistribution.C / totalStudents) * 100).toFixed(1)}%)</span>
                        </li>
                        <li class="list-group-item d-flex justify-content-between align-items-center">
                            D
                            <span class="badge bg-warning rounded-pill">${gradeDistribution.D} (${((gradeDistribution.D / totalStudents) * 100).toFixed(1)}%)</span>
                        </li>
                        <li class="list-group-item d-flex justify-content-between align-items-center">
                            F
                            <span class="badge bg-danger rounded-pill">${gradeDistribution.F} (${((gradeDistribution.F / totalStudents) * 100).toFixed(1)}%)</span>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    `;
    
    resultsContainer.appendChild(statsCard);
    
    // Öğrenci tablosu
    const tableCard = document.createElement('div');
    tableCard.className = 'card';
    tableCard.innerHTML = `
        <div class="card-header bg-primary text-white">
            <h5>Öğrenci Not Listesi</h5>
        </div>
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-striped mb-0">
                    <thead>
                        <tr>
                            <th>Öğrenci No</th>
                            <th>Adı</th>
                            <th>Soyadı</th>
                            <th>Puan</th>
                            <th>Harf Notu</th>
                        </tr>
                    </thead>
                    <tbody id="grade-student-list"></tbody>
                </table>
            </div>
        </div>
    `;
    
    resultsContainer.appendChild(tableCard);
    
    // Tabloyu doldur
    const studentList = document.getElementById('grade-student-list');
    
    studentsWithGrades.forEach((student, index) => {
        const row = document.createElement('tr');
        
        // Alternatif satır renklendirme
        if (index % 2 === 0) {
            row.classList.add('even-row');
        }
        
        // Harf notuna göre renk sınıfı
        let gradeBadgeClass = 'bg-secondary';
        switch(student.letter_grade) {
            case 'A': gradeBadgeClass = 'bg-primary'; break;
            case 'B': gradeBadgeClass = 'bg-success'; break;
            case 'C': gradeBadgeClass = 'bg-info'; break;
            case 'D': gradeBadgeClass = 'bg-warning'; break;
            case 'F': gradeBadgeClass = 'bg-danger'; break;
        }
        
        row.innerHTML = `
            <td>${student.student_no}</td>
            <td>${student.first_name}</td>
            <td>${student.last_name}</td>
            <td>${student.score}</td>
            <td><span class="badge ${gradeBadgeClass}">${student.letter_grade}</span></td>
        `;
        
        studentList.appendChild(row);
    });
}

// Excel dosyasına aktarma
function exportToExcel() {
    if (!currentClassName || !generatedGrades[currentClassName]) {
        alert('Excel\'e aktarılacak not bulunmuyor!');
        return;
    }
    
    const students = generatedGrades[currentClassName];
    
    // Yeni bir Excel çalışma kitabı oluştur
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Sınıf Analiz Uygulaması';
    workbook.created = new Date();
    
    // Çalışma sayfası ekle
    const worksheet = workbook.addWorksheet(currentClassName);
    
    // Başlıkları ekle
    worksheet.columns = [
        { header: 'Öğrenci No', key: 'student_no', width: 15 },
        { header: 'Adı', key: 'first_name', width: 20 },
        { header: 'Soyadı', key: 'last_name', width: 20 },
        { header: 'Puan', key: 'score', width: 10 },
        { header: 'Harf Notu', key: 'letter_grade', width: 10 }
    ];
    
    // Başlık stilini ayarla
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '4F81BD' }
    };
    worksheet.getRow(1).font = {
        color: { argb: 'FFFFFF' },
        bold: true
    };
    
    // Verileri ekle
    students.forEach(student => {
        worksheet.addRow({
            student_no: student.student_no,
            first_name: student.first_name,
            last_name: student.last_name,
            score: student.score,
            letter_grade: student.letter_grade
        });
    });
    
    // Excel dosyasını kaydet
    workbook.xlsx.writeBuffer().then(buffer => {
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, `${currentClassName.replace(/[^a-z0-9]/gi, '_')}_Notlar.xlsx`);
    });
}

// Olay dinleyicileri
document.addEventListener('DOMContentLoaded', function() {
    // Not oluşturma düğmesi için olay dinleyicisi
    document.getElementById('generate-grades-btn').addEventListener('click', generateGrades);
    
    // Excel'e aktarma düğmesi için olay dinleyicisi
    document.getElementById('export-grades-btn').addEventListener('click', exportToExcel);
}); 