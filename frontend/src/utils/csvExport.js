export function exportToCSV(data, columns, filename) {
  if (!data || !data.length) return

  // columns: array of { header: 'Name', key: 'name' } or { header: 'Name', render: (row) => ... }
  
  const headers = columns.map(c => `"${c.header.replace(/"/g, '""')}"`).join(',')
  
  const rows = data.map(row => {
    return columns.map(col => {
      let cellValue = ''
      if (col.render) {
        cellValue = col.render(row)
      } else if (col.key) {
        // Handle nested keys like 'student.name'
        cellValue = col.key.split('.').reduce((o, i) => (o ? o[i] : ''), row)
      }
      
      // Escape quotes and wrap in quotes
      const stringVal = String(cellValue ?? '')
      return `"${stringVal.replace(/"/g, '""')}"`
    }).join(',')
  })

  const csvContent = [headers, ...rows].join('\n')
  
  // Add BOM for UTF-8 Excel support (especially for Arabic)
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', `${filename}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
