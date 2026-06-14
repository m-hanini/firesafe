/**
 * 🚀 ALGORITHM OPTIMIZATION ENHANCEMENTS
 * Advanced features for optimization hub
 * - Real-time progress tracking
 * - Enhanced result visualization
 * - Better error handling
 * - Performance metrics
 */

class AlgorithmOptimizer {
    constructor() {
        this.isRunning = false;
        this.currentAlgorithm = 'ga';
        this.results = null;
        this.metrics = {
            startTime: null,
            endTime: null,
            executionTime: 0
        };
    }

    /**
     * Start algorithm execution with progress tracking
     */
    async runAlgorithm(algoType, data) {
        if (this.isRunning) {
            showWarning('Another algorithm is still running...');
            return;
        }

        this.isRunning = true;
        this.currentAlgorithm = algoType;
        this.metrics.startTime = Date.now();

        try {
            // Show loading state
            this.showOptimizationProgress();

            // Execute algorithm
            const response = await fetch(`/api/optimize/${algoType}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error(`Algorithm failed with status ${response.status}`);
            }

            const result = await response.json();
            
            this.metrics.endTime = Date.now();
            this.metrics.executionTime = this.metrics.endTime - this.metrics.startTime;

            this.results = result;
            this.displayResults(result);
            showSuccess(`✨ ${algoType.toUpperCase()} optimization completed in ${this.formatTime(this.metrics.executionTime)}`);

        } catch (error) {
            console.error('Algorithm error:', error);
            showError(`Failed to run ${algoType.toUpperCase()}: ${error.message}`);
        } finally {
            this.isRunning = false;
            this.hideOptimizationProgress();
        }
    }

    /**
     * Show optimization progress animation
     */
    showOptimizationProgress() {
        const container = document.querySelector('#optimization-results');
        if (!container) return;

        container.innerHTML = `
            <div class="info-card" style="background: linear-gradient(135deg, rgba(167, 139, 250, 0.1), rgba(217, 70, 239, 0.1)); border: 1px solid rgba(167, 139, 250, 0.3);">
                <div class="info-card-icon">⚙️</div>
                <div class="info-card-content">
                    <h4>Running ${this.currentAlgorithm.toUpperCase()} Optimization</h4>
                    <div class="progress-bar" style="margin-top: 12px;">
                        <div class="progress-fill" style="animation: slideInUp 0.5s ease infinite; width: 100%;"></div>
                    </div>
                    <p style="margin-top: 8px; font-size: 0.9rem;">
                        <span id="algo-progress-text">Initializing...</span>
                    </p>
                </div>
            </div>
        `;

        // Simulate progress updates
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress = Math.min(progress + Math.random() * 30, 95);
            const progressBar = container.querySelector('.progress-fill');
            if (progressBar) {
                progressBar.style.width = `${progress}%`;
            }
            
            const stages = [
                'Initializing parameters...',
                'Loading data...',
                'Processing units...',
                'Calculating routes...',
                'Optimizing dispatch...',
                'Finalizing results...'
            ];
            
            const stageIndex = Math.floor(progress / 15);
            const textEl = container.querySelector('#algo-progress-text');
            if (textEl && stages[stageIndex]) {
                textEl.textContent = stages[stageIndex];
            }
        }, 500);

        this.progressInterval = progressInterval;
    }

    /**
     * Hide optimization progress
     */
    hideOptimizationProgress() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
        }
    }

    /**
     * Display optimization results
     */
    displayResults(result) {
        const container = document.querySelector('#optimization-results');
        if (!container) return;

        const efficiency = result.efficiency || 0;
        const distance = result.total_distance || 0;
        const time = result.total_time || 0;
        const units = result.dispatch_plan?.length || 0;

        const html = `
            <div style="animation: slideInUp 0.4s ease;">
                <div class="dash-card" style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(139, 92, 246, 0.05));">
                    <h3>📊 Optimization Results</h3>
                    
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin-top: 16px;">
                        <div style="background: rgba(0,0,0,0.2); padding: 14px; border-radius: 10px; text-align: center;">
                            <div style="font-size: 2rem; font-weight: 800; color: var(--electric-blue);">${efficiency.toFixed(1)}%</div>
                            <div style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 4px;">Efficiency</div>
                        </div>
                        <div style="background: rgba(0,0,0,0.2); padding: 14px; border-radius: 10px; text-align: center;">
                            <div style="font-size: 2rem; font-weight: 800; color: #7dd3fc;">${distance.toFixed(0)} km</div>
                            <div style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 4px;">Total Distance</div>
                        </div>
                        <div style="background: rgba(0,0,0,0.2); padding: 14px; border-radius: 10px; text-align: center;">
                            <div style="font-size: 2rem; font-weight: 800; color: #fbbf24;">${this.formatTime(time)}</div>
                            <div style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 4px;">Total Time</div>
                        </div>
                        <div style="background: rgba(0,0,0,0.2); padding: 14px; border-radius: 10px; text-align: center;">
                            <div style="font-size: 2rem; font-weight: 800; color: #10b981;">${units}</div>
                            <div style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 4px;">Units</div>
                        </div>
                    </div>

                    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(167, 139, 250, 0.2);">
                        <h4 style="margin-bottom: 12px; color: var(--text-primary);">Execution Metrics</h4>
                        <div style="font-size: 0.95rem; color: var(--text-secondary); display: grid; gap: 8px;">
                            <div style="display: flex; justify-content: space-between;">
                                <span>Algorithm:</span>
                                <strong style="color: var(--electric-blue);">${this.currentAlgorithm.toUpperCase()}</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span>Execution Time:</span>
                                <strong style="color: var(--electric-blue);">${this.metrics.executionTime}ms</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span>Timestamp:</span>
                                <strong style="color: var(--electric-blue);">${new Date(this.metrics.endTime).toLocaleTimeString()}</strong>
                            </div>
                        </div>
                    </div>

                    <div style="margin-top: 16px; display: flex; gap: 12px;">
                        <button class="btn-primary" onclick="algorithmOptimizer.exportResults()" style="flex: 1; padding: 10px;">
                            📥 Export Results
                        </button>
                        <button class="btn-secondary" onclick="algorithmOptimizer.viewDispatchPlan()" style="flex: 1; padding: 10px;">
                            👀 View Plan
                        </button>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = html;
    }

    /**
     * Export results to JSON
     */
    exportResults() {
        if (!this.results) return;

        const dataStr = JSON.stringify(this.results, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        
        link.href = url;
        link.download = `optimization_results_${Date.now()}.json`;
        link.click();
        
        showSuccess('Results exported successfully!');
    }

    /**
     * View dispatch plan details
     */
    viewDispatchPlan() {
        if (!this.results?.dispatch_plan) {
            showWarning('No dispatch plan available');
            return;
        }

        const plan = this.results.dispatch_plan;
        let html = `
            <div style="max-height: 500px; overflow-y: auto;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Unit</th>
                            <th>From</th>
                            <th>To</th>
                            <th>Distance</th>
                            <th>Time</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        plan.forEach((dispatch, idx) => {
            html += `
                <tr>
                    <td>${idx + 1}</td>
                    <td><strong>${dispatch.unit_id}</strong></td>
                    <td>${dispatch.start_zone}</td>
                    <td>${dispatch.target_zone}</td>
                    <td>${dispatch.distance?.toFixed(1) || 'N/A'} km</td>
                    <td>${this.formatTime(dispatch.time) || 'N/A'}</td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        const modal = showModal(`
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">Dispatch Plan</h3>
                    <button onclick="this.closest('.modal-overlay').remove()" style="background: none; border: none; color: var(--text-primary); font-size: 1.5rem; cursor: pointer;">×</button>
                </div>
                ${html}
            </div>
        `);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    /**
     * Format time in seconds to readable format
     */
    formatTime(ms) {
        if (ms < 1000) return `${Math.round(ms)}ms`;
        const seconds = (ms / 1000).toFixed(1);
        if (seconds < 60) return `${seconds}s`;
        const minutes = (seconds / 60).toFixed(1);
        return `${minutes}m`;
    }
}

// Initialize algorithm optimizer
const algorithmOptimizer = new AlgorithmOptimizer();

// Export to window for easy access
window.algorithmOptimizer = algorithmOptimizer;

console.log('✅ Algorithm Optimizer initialized');
