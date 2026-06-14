/**
 * 🎨 UI ENHANCEMENTS MODULE
 * Professional UI improvements for FireSafe Manager
 * - Smooth animations
 * - Enhanced loading states
 * - Better error handling
 * - Form validations
 * - Performance optimizations
 */

class UIEnhancements {
    constructor() {
        this.isInitialized = false;
        this.loadingElements = new Map();
    }

    init() {
        if (this.isInitialized) return;
        
        this.setupLoadingStates();
        this.setupFormValidations();
        this.setupAnimations();
        this.setupTransitions();
        this.setupErrorHandling();
        
        this.isInitialized = true;
        console.log('✅ UI Enhancements initialized');
    }

    /**
     * Setup smooth loading states for async operations
     */
    setupLoadingStates() {
        window.showLoading = (element, message = 'Loading...') => {
            if (typeof element === 'string') {
                element = document.querySelector(element);
            }
            
            if (!element) return;
            
            const loadingHTML = `
                <div class="loading-state" style="animation: slideInUp 0.3s ease;">
                    <div class="loading-spinner"></div>
                    <span>${message}</span>
                </div>
            `;
            
            element.innerHTML = loadingHTML;
            element.classList.add('loading');
            
            return element;
        };

        window.hideLoading = (element) => {
            if (typeof element === 'string') {
                element = document.querySelector(element);
            }
            
            if (!element) return;
            
            element.classList.remove('loading');
            const loadingState = element.querySelector('.loading-state');
            if (loadingState) {
                loadingState.style.animation = 'fadeIn 0.3s ease';
            }
        };

        window.showSuccess = (message, duration = 3000) => {
            const toast = this.createToast('success', message);
            document.body.appendChild(toast);
            
            setTimeout(() => {
                toast.style.animation = 'slideIn 0.3s ease reverse';
                setTimeout(() => toast.remove(), 300);
            }, duration);
        };

        window.showError = (message, duration = 5000) => {
            const toast = this.createToast('error', message);
            document.body.appendChild(toast);
            
            setTimeout(() => {
                toast.style.animation = 'slideIn 0.3s ease reverse';
                setTimeout(() => toast.remove(), 300);
            }, duration);
        };

        window.showWarning = (message, duration = 4000) => {
            const toast = this.createToast('warning', message);
            document.body.appendChild(toast);
            
            setTimeout(() => {
                toast.style.animation = 'slideIn 0.3s ease reverse';
                setTimeout(() => toast.remove(), 300);
            }, duration);
        };
    }

    /**
     * Create toast notifications
     */
    createToast(type, message) {
        const toast = document.createElement('div');
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️'
        };
        
        toast.innerHTML = `
            <div class="toast toast-${type}" style="
                position: fixed;
                bottom: 24px;
                right: 24px;
                background: var(--card-bg);
                border-left: 4px solid ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#f59e0b'};
                border: 1px solid var(--glass-border);
                border-radius: 12px;
                padding: 16px 20px;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
                color: var(--text-primary);
                font-weight: 500;
                display: flex;
                align-items: center;
                gap: 12px;
                animation: slideIn 0.3s ease;
                z-index: 3000;
                min-width: 320px;
                max-width: 450px;
            ">
                <span style="font-size: 1.2rem;">${icons[type]}</span>
                <span>${message}</span>
            </div>
        `;
        
        return toast;
    }

    /**
     * Setup form validations
     */
    setupFormValidations() {
        window.validateForm = (formElement) => {
            const inputs = formElement.querySelectorAll('input[required], select[required], textarea[required]');
            let isValid = true;
            
            inputs.forEach(input => {
                const value = input.value.trim();
                
                if (!value) {
                    this.markInputError(input, 'This field is required');
                    isValid = false;
                } else if (input.type === 'email' && !this.isValidEmail(value)) {
                    this.markInputError(input, 'Please enter a valid email');
                    isValid = false;
                } else if (input.type === 'number' && isNaN(value)) {
                    this.markInputError(input, 'Please enter a valid number');
                    isValid = false;
                } else {
                    this.markInputValid(input);
                }
            });
            
            return isValid;
        };

        // Add live validation
        document.addEventListener('change', (e) => {
            if (e.target.matches('input[required], select[required], textarea[required]')) {
                const value = e.target.value.trim();
                
                if (value && e.target.type === 'email' && this.isValidEmail(value)) {
                    this.markInputValid(e.target);
                } else if (value && e.target.type !== 'email') {
                    this.markInputValid(e.target);
                }
            }
        });
    }

    /**
     * Mark input as invalid
     */
    markInputError(input, message) {
        input.style.borderColor = '#ef4444';
        input.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.1)';
        
        let errorMsg = input.parentElement.querySelector('.error-message');
        if (!errorMsg) {
            errorMsg = document.createElement('div');
            errorMsg.className = 'error-message';
            errorMsg.style.cssText = `
                color: #ef4444;
                font-size: 0.85rem;
                margin-top: 4px;
                animation: slideInUp 0.2s ease;
            `;
            input.parentElement.appendChild(errorMsg);
        }
        
        errorMsg.textContent = message;
    }

    /**
     * Mark input as valid
     */
    markInputValid(input) {
        input.style.borderColor = 'rgba(167, 139, 250, 0.3)';
        input.style.boxShadow = 'none';
        
        const errorMsg = input.parentElement.querySelector('.error-message');
        if (errorMsg) {
            errorMsg.style.animation = 'fadeIn 0.2s ease reverse';
            setTimeout(() => errorMsg.remove(), 200);
        }
    }

    /**
     * Email validation
     */
    isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    /**
     * Setup smooth animations
     */
    setupAnimations() {
        // Animate elements on scroll
        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.style.animation = 'slideInUp 0.5s ease forwards';
                        observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.1 });

            document.querySelectorAll('.dash-card, .info-card, .algo-card').forEach(el => {
                observer.observe(el);
            });
        }

        // Smooth fade-in for modal dialogs
        window.showModal = (htmlContent) => {
            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.innerHTML = htmlContent;
            modal.style.animation = 'fadeIn 0.2s ease';
            
            modal.querySelector('.modal-content').style.animation = 'slideInUp 0.3s ease';
            
            document.body.appendChild(modal);
            
            return modal;
        };
    }

    /**
     * Setup transitions
     */
    setupTransitions() {
        // Smooth page transitions
        const navButtons = document.querySelectorAll('.nav-btn');
        
        navButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget;
                
                // Add active state animation
                navButtons.forEach(b => b.classList.remove('active'));
                target.classList.add('active');
                
                // Animate content area
                const mainContent = document.querySelector('.main-content');
                if (mainContent) {
                    mainContent.style.animation = 'fadeIn 0.3s ease';
                }
            });
        });
    }

    /**
     * Setup error handling
     */
    setupErrorHandling() {
        window.addEventListener('error', (event) => {
            console.error('🔴 Error:', event.error);
            showError('Something went wrong. Please try again.');
        });

        // Handle promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            console.error('🔴 Unhandled rejection:', event.reason);
            showError('An error occurred. Please refresh the page.');
        });

        // Wrap fetch calls with error handling
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            return originalFetch.apply(this, args)
                .catch(error => {
                    console.error('🔴 Fetch error:', error);
                    throw error;
                });
        };
    }

    /**
     * Create progress bar
     */
    createProgressBar(container, percentage, label = '') {
        const progressHTML = `
            <div style="margin-bottom: 16px;">
                ${label ? `<label style="display: block; margin-bottom: 8px; font-size: 0.9rem; color: var(--text-secondary);">${label}</label>` : ''}
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${percentage}%; transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);"></div>
                </div>
            </div>
        `;
        
        if (typeof container === 'string') {
            document.querySelector(container).innerHTML = progressHTML;
        } else {
            container.innerHTML = progressHTML;
        }
    }

    /**
     * Create status badge
     */
    createBadge(text, type = 'active') {
        const badgeHTML = `<span class="status-badge status-badge-${type}">${text}</span>`;
        return badgeHTML;
    }

    /**
     * Add ripple effect to buttons
     */
    setupRippleEffect() {
        document.addEventListener('click', (e) => {
            if (e.target.matches('button, .btn-primary, .btn-secondary')) {
                const ripple = document.createElement('span');
                const rect = e.target.getBoundingClientRect();
                const size = Math.max(rect.width, rect.height);
                const x = e.clientX - rect.left - size / 2;
                const y = e.clientY - rect.top - size / 2;
                
                ripple.style.cssText = `
                    position: absolute;
                    width: ${size}px;
                    height: ${size}px;
                    background: rgba(255, 255, 255, 0.5);
                    border-radius: 50%;
                    left: ${x}px;
                    top: ${y}px;
                    animation: ripple 0.6s ease-out;
                    pointer-events: none;
                `;
                
                e.target.style.position = 'relative';
                e.target.appendChild(ripple);
                
                setTimeout(() => ripple.remove(), 600);
            }
        });
    }
}

// Initialize UI enhancements when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const ui = new UIEnhancements();
        ui.init();
        // ui.setupRippleEffect();
        window.uiEnhancements = ui;
    });
} else {
    const ui = new UIEnhancements();
    ui.init();
    // ui.setupRippleEffect();
    window.uiEnhancements = ui;
}
