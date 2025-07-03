// Initialize analytics functionality
function initAnalytics() {
    const dashboard = document.getElementById('analytics-dashboard');
    if (!window.lastReportData) {
        dashboard.innerHTML = '<div style="color:#e74c3c;font-weight:600;">Please generate a report in the "View Reports" tab first.</div>';
        return;
    }
    renderAnalyticsCharts(window.lastReportData);
}

function renderAnalyticsCharts(report) {
    // Calculate present and absent using the same logic as the report
    const present = report.summary.present_count || 0;
    const absent = Math.max((report.totalStudents || 0) - present, 0);

    const dashboard = document.getElementById('analytics-dashboard');
    dashboard.innerHTML = '<canvas id="analyticsChart" width="600" height="350"></canvas>';
    const ctx = document.getElementById('analyticsChart').getContext('2d');
    new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Present', 'Absent'],
            datasets: [{
                data: [present, absent],
                backgroundColor: ['#27ae60', '#e74c3c']
            }]
        },
        options: {
            plugins: {
                title: {
                    display: true,
                    text: `Attendance Distribution (${report.filters.date}, Semester ${report.filters.semester})`
                }
            }
        }
    });
    // You can add more charts (e.g., bar for attendance by student, etc.) here.
}

// Initialize analytics when the page loads
// (Call this from main.js when needed)
window.analytics = {
    initAnalytics
}; 