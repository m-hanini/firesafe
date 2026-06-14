# 📊 Advanced Reporting & Analytics System

## Overview
Professional data table and reporting system for FireSafe Manager with real-time filtering, sorting, pagination, and export capabilities.

---

## 🎯 Key Features

### 1. **Professional Data Tables**
- ✅ Sortable columns (ascending/descending)
- ✅ Real-time filtering/search
- ✅ Pagination with customizable rows per page
- ✅ Export to CSV or JSON
- ✅ Status badges with color coding
- ✅ Responsive design

### 2. **Pre-built Report Templates**
- ✅ Dispatch Report
- ✅ Active Alerts Report
- ✅ Units Status Report
- ✅ Custom reports

### 3. **Interactive Features**
- ✅ Click to select rows
- ✅ Hover highlights
- ✅ Column headers indicate sort status
- ✅ Real-time search
- ✅ Page navigation

### 4. **Export Options**
- ✅ CSV format (for Excel)
- ✅ JSON format (for API integration)
- ✅ One-click download

---

## 📖 Usage Guide

### Basic Table Creation

```javascript
advancedReporting.createDataTable(
    '#container-id',  // Container selector
    [
        { label: 'Column 1', key: 'field1' },
        { label: 'Column 2', key: 'field2' }
    ],
    data,  // Array of objects
    {
        title: 'Report Title',
        sortable: true,
        filterable: true,
        exportable: true,
        pageable: true,
        rowsPerPage: 10
    }
);
```

### Pre-built Report Templates

#### Dispatch Report
```javascript
advancedReporting.createDispatchReport(
    '#dispatch-container',
    dispatchData
);
```

**Columns:**
- ID
- Alert ID
- Unit ID
- Status (with badge)
- ETA (minutes)
- Distance (km)
- Timestamp

#### Active Alerts Report
```javascript
advancedReporting.createAlertsReport(
    '#alerts-container',
    alertsData
);
```

**Columns:**
- ID
- Title
- Severity (with badge)
- Zone
- Status (with badge)
- Coordinates
- Reporter
- Time

#### Units Status Report
```javascript
advancedReporting.createUnitsReport(
    '#units-container',
    unitsData
);
```

**Columns:**
- Unit ID
- Name
- Zone
- Status (with badge)
- Location (Lat/Lng)
- Equipment Count

---

## 🎨 CSS Classes

### Report Container
```css
.report-container          /* Main container */
.report-header            /* Header with title and actions */
.report-title             /* Report title */
.report-actions           /* Action buttons area */
.report-filter            /* Search/filter input */
```

### Table Styling
```css
.data-table-advanced      /* Main table */
.data-table-advanced th   /* Table headers */
.data-table-advanced td   /* Table cells */
.table-row               /* Table rows */
.table-row.selected      /* Selected row */
```

### Pagination
```css
.table-pagination        /* Pagination container */
.pagination-controls     /* Navigation buttons */
```

### Summary Cards
```css
.report-summary          /* Summary grid */
.summary-card           /* Individual card */
.summary-card-value     /* Large value */
.summary-card-label     /* Label text */
```

---

## 📋 Data Format

### Input Data Structure
```javascript
const data = [
    {
        id: 1,
        alert_id: 101,
        unit_id: 5,
        status: 'active',
        eta_minutes: 15,
        distance: 2.5,
        created_at: '2026-04-29T10:30:00Z'
    },
    // ... more rows
];
```

### Nested Properties
Supports dot notation for nested data:
```javascript
{
    label: 'Officer',
    key: 'unit.officer.name'  // Access nested objects
}
```

---

## 🎯 Advanced Options

### Custom Formatters
```javascript
{
    label: 'ETA',
    key: 'eta_minutes',
    format: (value, row) => {
        return value ? `${value} min` : '--';
    }
}
```

### Column Types
```javascript
// Status column (auto-badge)
{ label: 'Status', key: 'status' }

// Numeric column with formatting
{ label: 'Distance', key: 'distance', format: (v) => v.toFixed(2) }

// Date column
{ label: 'Time', key: 'created_at', format: (v) => new Date(v).toLocaleString() }

// Coordinates
{ label: 'Location', key: 'lat', format: (v, row) => `${v.toFixed(4)}, ${row.lng.toFixed(4)}` }
```

---

## 🔄 Programmatic Control

### Filter Table
```javascript
advancedReporting.filterTable('#container-id', 'search-text');
```

### Sort by Column
```javascript
advancedReporting.sortTable('#container-id', 'column-key');
```

### Navigate Pages
```javascript
advancedReporting.nextPage('#container-id');
advancedReporting.previousPage('#container-id');
```

### Export Data
```javascript
advancedReporting.exportTable('#container-id', 'csv');   // CSV
advancedReporting.exportTable('#container-id', 'json');  // JSON
```

---

## 🎨 Status Badges

Automatic status badge colors:
- ✅ **Active** (green): active, available, resolved
- ⚠️ **Warning** (yellow): busy, in progress
- 🔴 **Critical** (red): critical, error, closed
- ⚫ **Inactive** (gray): others

---

## 📱 Responsive Design

### Desktop (1024px+)
- Full table width
- All columns visible
- Normal font sizes

### Tablet (768px - 1024px)
- Slightly reduced padding
- Smaller font sizes
- Flexible grid

### Mobile (480px - 768px)
- Compact table view
- Reduced padding
- Stack controls

### Small Mobile (<480px)
- Single column summary cards
- Minimal padding
- Touch-friendly buttons

---

## 💡 Best Practices

1. **Large Datasets**: Use pagination for performance
2. **Real-time Updates**: Re-create table with new data
3. **Error Handling**: Validate data before creating table
4. **Accessibility**: Use proper column labels
5. **Performance**: Filter before sorting large datasets
6. **User Feedback**: Show loading state during async operations

---

## 🔧 Configuration Options

```javascript
const options = {
    title: 'Report Title',         // Report heading
    sortable: true,                // Enable column sorting
    filterable: true,              // Enable search filter
    exportable: true,              // Enable export buttons
    pageable: true,                // Enable pagination
    rowsPerPage: 10,               // Rows per page
};
```

---

## 📊 Example: Complete Report

```javascript
// Fetch data from API
const dispatchData = await fetch('/api/dispatches').then(r => r.json());

// Create dispatch report
advancedReporting.createDispatchReport('#report-container', dispatchData);

// Add summary cards
document.querySelector('#summary-container').innerHTML = `
    <div class="report-summary">
        <div class="summary-card">
            <div class="summary-card-icon">🚚</div>
            <div class="summary-card-value">${dispatchData.length}</div>
            <div class="summary-card-label">Total Dispatches</div>
        </div>
        <div class="summary-card">
            <div class="summary-card-icon">✅</div>
            <div class="summary-card-value">
                ${dispatchData.filter(d => d.status === 'completed').length}
            </div>
            <div class="summary-card-label">Completed</div>
        </div>
        <div class="summary-card">
            <div class="summary-card-icon">⏳</div>
            <div class="summary-card-value">
                ${dispatchData.filter(d => d.status === 'pending').length}
            </div>
            <div class="summary-card-label">Pending</div>
        </div>
    </div>
`;
```

---

## 🐛 Troubleshooting

### Table not showing
- Check container ID matches
- Verify data array is not empty
- Ensure column keys match data properties

### Filter not working
- Verify filterable: true in options
- Check search text matches data
- Try case-insensitive search

### Export failing
- Check browser supports Blob API
- Verify data is valid JSON
- Check file permissions

### Sort not working
- Click column header
- Check sortable: true in options
- Verify data types are consistent

---

## 📞 Support

For issues or feature requests:
1. Check data format
2. Verify options configuration
3. Test with sample data
4. Check browser console for errors

---

**Version**: 1.0.0  
**Status**: Production Ready ✅  
**Last Updated**: April 29, 2026
