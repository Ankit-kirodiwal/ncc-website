/**
 * Excel Export Utility for Attendance Reports
 * Generates date-wise attendance Excel file for admin
 */

const XLSX = require('xlsx');

// ==================== GENERATE EXCEL REPORT ====================

function generateAttendanceExcel(reportData) {
  try {
    console.log("📊 Generating Excel report...");

    const { year, studentStats, dateRange } = reportData;

    // Get unique dates from all attendance records
    const allDates = new Set();
    studentStats.forEach(student => {
      student.recentRecords.forEach(record => {
        allDates.add(record.date);
      });
    });

    const sortedDates = Array.from(allDates).sort();
    console.log(`📅 Found ${sortedDates.length} unique dates`);

    if (sortedDates.length === 0) {
      console.log("⚠️ No attendance records found for this year");
      sortedDates.push('No Data');
    }

    // Create header row
    const headers = ['Regimental No', 'Name', ...sortedDates];

    // Create data rows
    const dataRows = studentStats.map(student => {
      const row = [student.regNo, student.name];

      // Add attendance for each date
      sortedDates.forEach(date => {
        if (date === 'No Data') {
          row.push('-');
        } else {
          const record = student.recentRecords.find(r => r.date === date);
          if (record) {
            // Convert to single letter: P, A, L
            const status = record.status === 'present' ? 'P' :
                          record.status === 'absent' ? 'A' :
                          record.status === 'leave' ? 'L' : '-';
            row.push(status);
          } else {
            row.push('-'); // Not marked
          }
        }
      });

      return row;
    });

    // Create workbook
    const workbook = XLSX.utils.book_new();

    // Create worksheet
    const worksheetData = [headers, ...dataRows];
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

    // Set column widths
    const columnWidths = [
      { wch: 18 }, // Regimental No
      { wch: 20 }, // Name
      ...sortedDates.map(() => ({ wch: 12 })) // Date columns
    ];
    worksheet['!cols'] = columnWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, `Year ${year}`);

    // Generate filename
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `Attendance_Year${year}_${timestamp}.xlsx`;

    console.log(`✅ Excel report created: ${filename}`);

    return { workbook, filename };
  } catch (error) {
    console.error("❌ Error generating Excel:", error);
    throw error;
  }
}

// ==================== EXPORT FOR FRONTEND ====================

function convertExcelToBuffer(workbook) {
  try {
    return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  } catch (error) {
    console.error("❌ Error converting to buffer:", error);
    throw error;
  }
}

module.exports = {
  generateAttendanceExcel,
  convertExcelToBuffer
};