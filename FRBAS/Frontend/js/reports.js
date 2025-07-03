// Initialize reports functionality
function initReports() {
    // Get DOM elements
    const generateReportBtn = document.getElementById('generateReport');
    const exportReportBtn = document.getElementById('exportReport');
    const exportPDFBtn = document.getElementById('exportPDF');
    
    // Add event listeners
    generateReportBtn.addEventListener('click', generateAttendanceReport);
    exportReportBtn.addEventListener('click', exportReportToCSV);
    exportPDFBtn.addEventListener('click', exportReportToPDF);
    
    // Set default date to today
    document.getElementById('reportDate').valueAsDate = new Date();
    
    console.log('Reports system initialized');
}

// Generate attendance report based on selected filters
async function generateAttendanceReport() {
    const semester = document.getElementById('reportSemester').value;
    const date = document.getElementById('reportDate').value;
    
    if (!date) {
        alert('Please select a date.');
        return;
    }

    if (semester === 'all') {
        alert('Please select a specific semester to generate the report.');
        clearReportData();
        return;
    }
    
    try {
        // 1. Get the total number of students for the semester
        const studentsCountResponse = await fetch(`/api/attendance/students/count/${semester}`);
        if (!studentsCountResponse.ok) {
            const errText = await studentsCountResponse.text();
            console.error('Error fetching student count:', errText);
            alert('Error fetching student count: ' + errText);
            clearReportData();
            return;
        }
        const studentsCount = await studentsCountResponse.json();
        const totalStudents = studentsCount.total_students || 0;

        // 2. Get the session for the selected date and semester
        const sessionsResponse = await fetch('/api/attendance/sessions/by-date', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, semester })
        });

        if (!sessionsResponse.ok) {
            const errText = await sessionsResponse.text();
            console.error('Error fetching sessions:', errText);
            alert('Error fetching sessions: ' + errText);
            clearReportData();
            return;
        }

        const sessions = await sessionsResponse.json();

        if (!Array.isArray(sessions) || sessions.length === 0) {
            alert('No attendance session found for the selected semester and date.\n\nPlease make sure you have started a session in the Take Attendance tab for this semester and date.');
            clearReportData();
            return;
        }

        // 3. Fetch attendance data for this session
        const sessionId = sessions[0].SessionID || sessions[0].sessionId;
        const attendanceResponse = await fetch(`/api/attendance/sessions/${sessionId}`);
        if (!attendanceResponse.ok) {
            const errText = await attendanceResponse.text();
            console.error('Error fetching attendance:', errText);
            alert('Error fetching attendance: ' + errText);
            clearReportData();
            return;
        }
        const attendanceData = await attendanceResponse.json();

        // 4. Fetch summary for this session
        const summaryResponse = await fetch(`/api/attendance/summary/${sessionId}`);
        if (!summaryResponse.ok) {
            const errText = await summaryResponse.text();
            console.error('Error fetching summary:', errText);
            alert('Error fetching summary: ' + errText);
            clearReportData();
            return;
        }
        const summary = await summaryResponse.json();

        // 5. Update the report UI with the fetched data
        updateReportUI(attendanceData, summary, sessions[0], totalStudents);

        // Store last report data
        window.lastReportData = {
            attendanceData,
            summary,
            session: sessions[0],
            totalStudents,
            filters: {
                semester,
                date
            }
        };

        // If analytics tab is active, update it immediately
        if (document.getElementById('analytics').classList.contains('active')) {
            if (window.analytics && typeof window.analytics.initAnalytics === 'function') {
                window.analytics.initAnalytics();
            }
        }
    } catch (error) {
        console.error('Error generating report:', error);
        alert('Failed to generate report. Please try again. See console for details.');
        clearReportData();
    }
}

// Update the report UI with the fetched data
function updateReportUI(attendanceData, summary, session, totalStudents) {
    // Show session ID in the report summary
    let reportSummaryDiv = document.querySelector('.report-summary');
    let sessionIdSpan = document.getElementById('report-session-id');
    if (!sessionIdSpan) {
        sessionIdSpan = document.createElement('span');
        sessionIdSpan.id = 'report-session-id';
        sessionIdSpan.style.marginLeft = '20px';
        sessionIdSpan.style.fontWeight = 'bold';
        reportSummaryDiv.appendChild(sessionIdSpan);
    }
    sessionIdSpan.textContent = `Session ID: ${session.SessionID || session.sessionId || ''}`;

    // Calculate present and absent
    const presentCount = summary.present_count || 0;
    const absentCount = Math.max(totalStudents - presentCount, 0);

    // Update summary information
    document.getElementById('report-total').textContent = totalStudents;
    document.getElementById('report-present').textContent = presentCount;
    document.getElementById('report-absent').textContent = absentCount;
    
    // Calculate attendance rate based on total students
    const attendanceRate = totalStudents > 0 
        ? ((presentCount / totalStudents) * 100).toFixed(1) 
        : '0.0';
    document.getElementById('report-rate').textContent = `${attendanceRate}%`;
    
    // Update table data
    const tableBody = document.getElementById('report-data');
    tableBody.innerHTML = '';
    
    if (attendanceData && attendanceData.length > 0) {
        attendanceData.forEach(student => {
            const row = document.createElement('tr');
            // USN cell
            const usnCell = document.createElement('td');
            usnCell.textContent = student.USN || student.usn || '';
            row.appendChild(usnCell);
            // Name cell
            const nameCell = document.createElement('td');
            nameCell.textContent = student.Name || student.name || '';
            row.appendChild(nameCell);
            // Status cell
            const statusCell = document.createElement('td');
            statusCell.textContent = student.AttendanceStatus || student.attendanceStatus || 'Absent';
            statusCell.className = (student.AttendanceStatus || student.attendanceStatus) === 'Present' ? 'present' : 'absent';
            row.appendChild(statusCell);
            tableBody.appendChild(row);
        });
    } else {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 3;
        cell.textContent = 'No students found for this session.';
        cell.style.textAlign = 'center';
        row.appendChild(cell);
        tableBody.appendChild(row);
    }
}

// Export the current report to PDF
function exportReportToPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "a4"
    });

    // Colors and fonts
    const mainColor = "#1a237e";
    const accentColor = "#3498db";
    const borderColor = "#e0e6ed";
    const headerBg = "#f5f7fa";
    const textColor = "#2c3e50";
    const tableHeaderBg = [26, 35, 126];
    const tableAltRow = [245, 247, 250];
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(headerBg);
    doc.rect(0, 0, pageWidth, 90, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(30);
    doc.setTextColor(mainColor);
    doc.text("Face Recognition Attendance System", pageWidth / 2, 48, { align: "center" });
    doc.setFontSize(18);
    doc.setTextColor(accentColor);
    doc.text("Attendance Report", pageWidth / 2, 75, { align: "center" });

    // Improved summary box (multi-row, multi-column grid)
    const boxX = 60;
    const boxY = 110;
    const boxW = pageWidth - 120;
    const boxH = 110;
    doc.setFillColor("#fff");
    doc.roundedRect(boxX, boxY, boxW, boxH, 10, 10, "F");
    doc.setDrawColor(borderColor);
    doc.roundedRect(boxX, boxY, boxW, boxH, 10, 10, "S");

    // Summary fields
    const date = document.getElementById('reportDate').value;
    const semester = document.getElementById('reportSemester').value;
    const totalStudents = document.getElementById('report-total').textContent;
    const presentCount = document.getElementById('report-present').textContent;
    const absentCount = document.getElementById('report-absent').textContent;
    const attendanceRate = document.getElementById('report-rate').textContent;
    const sessionId = document.getElementById('report-session-id')?.textContent || '';

    // Layout: 2 rows, 4 columns per row (last row may have fewer columns)
    const fields = [
        { label: "Date:", value: date },
        { label: "Semester:", value: semester === 'all' ? 'All Semesters' : 'Semester ' + semester },
        { label: "Session ID:", value: sessionId },
        { label: "Total Students:", value: totalStudents },
        { label: "Present:", value: presentCount },
        { label: "Absent:", value: absentCount },
        { label: "Attendance Rate:", value: attendanceRate }
    ];
    const colsPerRow = 4;
    const colW = boxW / colsPerRow;
    const labelY1 = boxY + 28;
    const valueY1 = boxY + 48;
    const labelY2 = boxY + 70;
    const valueY2 = boxY + 90;
    doc.setFontSize(12);
    // First row
    for (let i = 0; i < colsPerRow && i < fields.length; i++) {
        const colX = boxX + i * colW + 8;
        doc.setFont("helvetica", "bold");
        doc.setTextColor(mainColor);
        doc.text(fields[i].label, colX, labelY1);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(textColor);
        doc.text(fields[i].value, colX, valueY1);
    }
    // Second row
    for (let i = colsPerRow; i < fields.length; i++) {
        const colX = boxX + (i - colsPerRow) * colW + 8;
        doc.setFont("helvetica", "bold");
        doc.setTextColor(mainColor);
        doc.text(fields[i].label, colX, labelY2);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(textColor);
        doc.text(fields[i].value, colX, valueY2);
    }

    // Horizontal line between summary and table
    const lineY = boxY + boxH + 18;
    doc.setDrawColor(borderColor);
    doc.setLineWidth(1);
    doc.line(boxX, lineY, boxX + boxW, lineY);

    // Table data
    const table = document.getElementById('report-table');
    const headers = [["USN", "Name", "Status"]];
    const body = [];
    for (let i = 1; i < table.rows.length; i++) {
        const row = table.rows[i];
        body.push([
            row.cells[0].textContent,
            row.cells[1].textContent,
            row.cells[2].textContent
        ]);
    }

    // Table with custom styles
    doc.autoTable({
        startY: lineY + 16,
        head: headers,
        body: body,
        theme: "striped",
        headStyles: {
            fillColor: tableHeaderBg,
            textColor: [255,255,255],
            fontStyle: "bold",
            fontSize: 13,
            halign: "center"
        },
        bodyStyles: {
            fontSize: 12,
            textColor: textColor,
            halign: "center"
        },
        alternateRowStyles: {
            fillColor: tableAltRow
        },
        styles: {
            cellPadding: 8,
            minCellHeight: 22,
            lineColor: borderColor,
            lineWidth: 0.5,
        },
        tableLineColor: borderColor,
        tableLineWidth: 0.5,
        margin: { left: boxX, right: boxX }
    });

    // Footer
    const now = new Date();
    const dateStr = now.toLocaleString();
    doc.setFontSize(10);
    doc.setTextColor("#888");
    doc.text(`Generated on: ${dateStr}`, boxX, doc.internal.pageSize.getHeight() - 30);
    doc.text(`© 2025 Face Recognition Attendance System`, pageWidth - boxX, doc.internal.pageSize.getHeight() - 30, { align: "right" });

    // Save the PDF
    const fileName = `attendance_report_${semester !== 'all' ? 'sem_' + semester + '_' : ''}${date}.pdf`;
    doc.save(fileName);
}

// Export the current report to CSV
function exportReportToCSV() {
    const table = document.getElementById('report-table');
    if (!table || table.rows.length <= 1) {
        alert('No data to export.');
        return;
    }
    
    // Get the date from the report filter
    const date = document.getElementById('reportDate').value;
    const semester = document.getElementById('reportSemester').value;
    
    // Create CSV content
    let csv = 'USN,Name,Status\n';
    
    // Skip header row (index 0)
    for (let i = 1; i < table.rows.length; i++) {
        const row = table.rows[i];
        const usn = row.cells[0].textContent;
        const name = row.cells[1].textContent;
        const status = row.cells[2].textContent;
        
        csv += `"${usn}","${name}","${status}"\n`;
    }
    
    // Create download link
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_report_${semester !== 'all' ? 'sem_' + semester + '_' : ''}${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Clear report data
function clearReportData() {
    document.getElementById('report-total').textContent = '0';
    document.getElementById('report-present').textContent = '0';
    document.getElementById('report-absent').textContent = '0';
    document.getElementById('report-rate').textContent = '0%';
    document.getElementById('report-data').innerHTML = '';
}

// Initialize reports when the page loads
document.addEventListener('DOMContentLoaded', initReports);

// Export functions for use in other scripts
window.reports = {
    initReports
};