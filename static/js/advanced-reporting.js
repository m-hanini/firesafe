/**
 * 📊 ADVANCED REPORTING & ANALYTICS
 * Professional data tables and reports system
 * - Real-time data display
 * - Sortable columns
 * - Filterable tables
 * - Export to CSV/JSON
 * - Professional styling
 */

class AdvancedReporting {
    constructor() {
        this.tables = new Map();
        this.filters = new Map();
        this.sortConfig = {};
    }

    /**
     * Initialize advanced reporting system
     */
    init() {
        this.setupTableListeners();
        console.log('✅ Advanced Reporting System initialized');
    }

    /**
     * Create professional data table
     */
    createDataTable(containerId, columns, data, options = {}) {
        const container = document.querySelector(containerId);
        if (!container) return;

        const {
            sortable = true,
            filterable = true,
            exportable = true,
            pageable = true,
            rowsPerPage = 10,
            title = 'Data Report'
        } = options;

        let html = `
            <div class="report-container">
                <div class="report-header">
                    <h3 class="report-title">${title}</h3>
                    <div class="report-actions">
        `;

        if (filterable) {
            html += `
                        <input type="text" class="report-filter" placeholder="Search..." data-table="${containerId}">
            `;
        }

        if (exportable) {
            html += `
                        <button class="btn-secondary" onclick="advancedReporting.exportTable('${containerId}', 'csv')">📥 CSV</button>
                        <button class="btn-secondary" onclick="advancedReporting.exportTable('${containerId}', 'json')">📥 JSON</button>
            `;
        }

        html += `
                    </div>
                </div>

                <div class="table-responsive">
                    <table class="data-table-advanced" id="table-${containerId}">
                        <thead>
                            <tr>
        `;

        // Table headers
        columns.forEach(col => {
            html += `
                                <th ${sortable ? `onclick="advancedReporting.sortTable('${containerId}', '${col.key}')" style="cursor: pointer;"` : ''}>
                                    ${col.label}
                                    ${sortable ? '<span class="sort-indicator">⇅</span>' : ''}
                                </th>
            `;
        });

        html += `
                            </tr>
                        </thead>
                        <tbody>
        `;

        // Table rows
        data.forEach((row, idx) => {
            html += `<tr class="table-row" data-index="${idx}">`;
            
            columns.forEach(col => {
                let value = this.getNestedValue(row, col.key);
                
                // Format value if formatter provided
                if (col.format) {
                    value = col.format(value, row);
                }
                
                // Add status badge if applicable
                if (col.key.toLowerCase().includes('status') && typeof value === 'string') {
                    const statusClass = this.getStatusClass(value);
                    value = `<span class="status-badge status-badge-${statusClass}">${value}</span>`;
                }
                
                html += `<td>${value}</td>`;
            });

            html += `</tr>`;
        });

        html += `
                        </tbody>
                    </table>
                </div>

                ${pageable ? `
                    <div class="table-pagination">
                        <span>Showing <strong id="page-info-${containerId}">1-${Math.min(rowsPerPage, data.length)}</strong> of <strong>${data.length}</strong></span>
                        <div class="pagination-controls">
                            <button onclick="advancedReporting.previousPage('${containerId}')" class="btn-secondary">← Previous</button>
                            <span id="page-number-${containerId}">Page 1</span>
                            <button onclick="advancedReporting.nextPage('${containerId}')" class="btn-secondary">Next →</button>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;

        container.innerHTML = html;

        // Store table config
        this.tables.set(containerId, {
            columns,
            data: data,
            allData: [...data],
            sortable,
            filterable,
            currentPage: 0,
            rowsPerPage,
            sortKey: null,
            sortOrder: 'asc'
        });

        // Setup filter listener
        if (filterable) {
            const filterInput = container.querySelector('.report-filter');
            if (filterInput) {
                filterInput.addEventListener('keyup', (e) => this.filterTable(containerId, e.target.value));
            }
        }

        return container;
    }

    /**
     * Get nested value from object
     */
    getNestedValue(obj, key) {
        return key.split('.').reduce((acc, part) => acc?.[part] ?? 'N/A', obj);
    }

    /**
     * Get status class for badge styling
     */
    getStatusClass(value) {
        value = value.toLowerCase();
        if (value.includes('active') || value.includes('available') || value.includes('resolved')) {
            return 'active';
        }
        if (value.includes('busy') || value.includes('in progress')) {
            return 'warning';
        }
        if (value.includes('critical') || value.includes('error') || value.includes('closed')) {
            return 'critical';
        }
        return 'inactive';
    }

    /**
     * Filter table data
     */
    filterTable(containerId, searchText) {
        const config = this.tables.get(containerId);
        if (!config) return;

        const filtered = config.allData.filter(row => {
            return JSON.stringify(row).toLowerCase().includes(searchText.toLowerCase());
        });

        config.data = filtered;
        config.currentPage = 0;
        this.updateTable(containerId);
    }

    /**
     * Sort table by column
     */
    sortTable(containerId, key) {
        const config = this.tables.get(containerId);
        if (!config) return;

        if (config.sortKey === key) {
            config.sortOrder = config.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
            config.sortKey = key;
            config.sortOrder = 'asc';
        }

        config.data.sort((a, b) => {
            let aVal = this.getNestedValue(a, key);
            let bVal = this.getNestedValue(b, key);

            if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = bVal.toLowerCase();
            }

            if (aVal < bVal) return config.sortOrder === 'asc' ? -1 : 1;
            if (aVal > bVal) return config.sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        config.currentPage = 0;
        this.updateTable(containerId);
    }

    /**
     * Update table display
     */
    updateTable(containerId) {
        const config = this.tables.get(containerId);
        if (!config) return;

        const container = document.querySelector(containerId);
        const table = container.querySelector('table tbody');
        const startIdx = config.currentPage * config.rowsPerPage;
        const endIdx = startIdx + config.rowsPerPage;
        const pageData = config.data.slice(startIdx, endIdx);

        let html = '';
        pageData.forEach((row, idx) => {
            html += `<tr class="table-row" data-index="${idx}">`;
            
            config.columns.forEach(col => {
                let value = this.getNestedValue(row, col.key);
                
                if (col.format) {
                    value = col.format(value, row);
                }
                
                if (col.key.toLowerCase().includes('status') && typeof value === 'string') {
                    const statusClass = this.getStatusClass(value);
                    value = `<span class="status-badge status-badge-${statusClass}">${value}</span>`;
                }
                
                html += `<td>${value}</td>`;
            });

            html += `</tr>`;
        });

        table.innerHTML = html;

        // Update pagination
        if (container.querySelector(`#page-info-${containerId}`)) {
            const total = config.data.length;
            const start = total === 0 ? 0 : startIdx + 1;
            const end = Math.min(endIdx, total);
            container.querySelector(`#page-info-${containerId}`).textContent = `${start}-${end}`;
            container.querySelector(`#page-number-${containerId}`).textContent = `Page ${config.currentPage + 1}`;
        }
    }

    /**
     * Navigate to next page
     */
    nextPage(containerId) {
        const config = this.tables.get(containerId);
        if (!config) return;

        const maxPages = Math.ceil(config.data.length / config.rowsPerPage);
        if (config.currentPage < maxPages - 1) {
            config.currentPage++;
            this.updateTable(containerId);
        }
    }

    /**
     * Navigate to previous page
     */
    previousPage(containerId) {
        const config = this.tables.get(containerId);
        if (!config) return;

        if (config.currentPage > 0) {
            config.currentPage--;
            this.updateTable(containerId);
        }
    }

    /**
     * Export table to CSV
     */
    exportTable(containerId, format) {
        const config = this.tables.get(containerId);
        if (!config) return;

        if (format === 'csv') {
            this.exportToCSV(config);
        } else if (format === 'json') {
            this.exportToJSON(config);
        }
    }

    /**
     * Export to CSV format
     */
    exportToCSV(config) {
        let csv = config.columns.map(col => `"${col.label}"`).join(',') + '\n';
        
        config.data.forEach(row => {
            const values = config.columns.map(col => {
                const value = this.getNestedValue(row, col.key);
                return `"${value}"`;
            });
            csv += values.join(',') + '\n';
        });

        this.downloadFile(csv, `report_${Date.now()}.csv`, 'text/csv');
        showSuccess('Report exported to CSV');
    }

    /**
     * Export to JSON format
     */
    exportToJSON(config) {
        const json = JSON.stringify(config.data, null, 2);
        this.downloadFile(json, `report_${Date.now()}.json`, 'application/json');
        showSuccess('Report exported to JSON');
    }

    /**
     * Download file helper
     */
    downloadFile(content, filename, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Setup table listeners
     */
    setupTableListeners() {
        document.addEventListener('click', (e) => {
            if (e.target.matches('.table-row')) {
                e.target.parentElement.querySelectorAll('.table-row').forEach(row => {
                    row.style.background = '';
                });
                e.target.style.background = 'rgba(167, 139, 250, 0.1)';
            }
        });
    }

    /**
     * Create dispatch report table
     */
    createDispatchReport(containerId, dispatchData) {
        return this.createDataTable(containerId, [
            { label: 'ID', key: 'id' },
            { label: 'Alert', key: 'alert_id' },
            { label: 'Unit', key: 'unit_id' },
            { label: 'Status', key: 'status' },
            { label: 'ETA (min)', key: 'eta_minutes', format: (v) => v || '--' },
            { label: 'Distance (km)', key: 'distance', format: (v) => v ? v.toFixed(2) : '--' },
            { label: 'Timestamp', key: 'created_at', format: (v) => new Date(v).toLocaleString() }
        ], dispatchData, {
            title: '🚚 Dispatch Report',
            sortable: true,
            filterable: true,
            exportable: true,
            pageable: true
        });
    }

    /**
     * Create alerts report table
     */
    createAlertsReport(containerId, alertsData) {
        return this.createDataTable(containerId, [
            { label: 'ID', key: 'id' },
            { label: 'Title', key: 'title' },
            { label: 'Severity', key: 'severity' },
            { label: 'Zone', key: 'zone_id' },
            { label: 'Status', key: 'status' },
            { label: 'Lat/Lng', key: 'lat', format: (v, row) => `${v.toFixed(4)}, ${row.lng.toFixed(4)}` },
            { label: 'Reported', key: 'reporter_name' },
            { label: 'Time', key: 'created_at', format: (v) => new Date(v).toLocaleTimeString() }
        ], alertsData, {
            title: '🚨 Active Alerts Report',
            sortable: true,
            filterable: true,
            exportable: true,
            pageable: true
        });
    }

    /**
     * Create units report table
     */
    createUnitsReport(containerId, unitsData) {
        return this.createDataTable(containerId, [
            { label: 'Unit ID', key: 'id' },
            { label: 'Name', key: 'name' },
            { label: 'Zone', key: 'zone_id' },
            { label: 'Status', key: 'status' },
            { label: 'Location', key: 'lat', format: (v, row) => `${v.toFixed(2)}, ${row.lng.toFixed(2)}` },
            { label: 'Equipment', key: 'equipment_count', format: (v) => v || 0 }
        ], unitsData, {
            title: '🚒 Units Status Report',
            sortable: true,
            filterable: true,
            exportable: true,
            pageable: true
        });
    }
}

// Initialize advanced reporting
const advancedReporting = new AdvancedReporting();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        advancedReporting.init();
    });
} else {
    advancedReporting.init();
}

console.log('✅ Advanced Reporting System loaded');
