/**
 * 📋 ADVANCED FORM VALIDATION SYSTEM
 * Real-time validation with professional error handling
 * - Input validation
 * - Error messages
 * - Field dependencies
 * - Custom validators
 */

class FormValidator {
    constructor() {
        this.validators = {
            required: this.validateRequired,
            email: this.validateEmail,
            number: this.validateNumber,
            phone: this.validatePhone,
            url: this.validateUrl,
            minLength: this.validateMinLength,
            maxLength: this.validateMaxLength,
            pattern: this.validatePattern,
            latitude: this.validateLatitude,
            longitude: this.validateLongitude,
            customRequired: this.validateCustomRequired
        };
        
        this.form = null;
        this.fields = new Map();
    }

    /**
     * Initialize form validation
     */
    init(formElement) {
        this.form = typeof formElement === 'string' 
            ? document.querySelector(formElement) 
            : formElement;

        if (!this.form) return;

        this.setupFieldListeners();
        this.setupFormSubmit();
        
        console.log('✅ Form validator initialized');
    }

    /**
     * Setup real-time field listeners
     */
    setupFieldListeners() {
        const inputs = this.form.querySelectorAll('input, select, textarea');
        
        inputs.forEach(input => {
            // Store field validation rules
            const rules = this.getFieldRules(input);
            if (rules.length > 0) {
                this.fields.set(input.name, { input, rules });
            }

            // Add event listeners for real-time validation
            input.addEventListener('blur', () => this.validateField(input));
            input.addEventListener('change', () => this.validateField(input));
            input.addEventListener('input', (e) => {
                // Debounce for input event
                clearTimeout(input.validationTimeout);
                input.validationTimeout = setTimeout(() => {
                    this.validateField(input);
                }, 500);
            });
        });
    }

    /**
     * Setup form submit handler
     */
    setupFormSubmit() {
        this.form.addEventListener('submit', (e) => {
            if (!this.validateAll()) {
                e.preventDefault();
                showError('Please fix the errors below');
            }
        });
    }

    /**
     * Get validation rules from input attributes
     */
    getFieldRules(input) {
        const rules = [];
        
        if (input.hasAttribute('required')) {
            rules.push('required');
        }
        if (input.type === 'email') {
            rules.push('email');
        }
        if (input.type === 'number') {
            rules.push('number');
        }
        if (input.hasAttribute('pattern')) {
            rules.push('pattern');
        }
        if (input.hasAttribute('data-validate')) {
            const validators = input.getAttribute('data-validate').split(' ');
            rules.push(...validators);
        }
        if (input.hasAttribute('minlength')) {
            rules.push('minLength');
        }
        if (input.hasAttribute('maxlength')) {
            rules.push('maxLength');
        }
        
        return rules;
    }

    /**
     * Validate single field
     */
    validateField(input) {
        const rules = this.getFieldRules(input);
        
        for (const rule of rules) {
            const validator = this.validators[rule];
            if (validator) {
                const result = validator.call(this, input);
                if (!result.valid) {
                    this.showFieldError(input, result.message);
                    return false;
                }
            }
        }
        
        this.clearFieldError(input);
        return true;
    }

    /**
     * Validate all form fields
     */
    validateAll() {
        let isValid = true;
        
        this.fields.forEach(({ input }) => {
            if (!this.validateField(input)) {
                isValid = false;
            }
        });
        
        return isValid;
    }

    /**
     * Show field error
     */
    showFieldError(input, message) {
        input.classList.add('error-field');
        input.style.borderColor = '#ef4444';
        input.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.1)';

        let errorMsg = input.parentElement.querySelector('.field-error');
        if (!errorMsg) {
            errorMsg = document.createElement('div');
            errorMsg.className = 'field-error';
            errorMsg.style.cssText = `
                color: #ef4444;
                font-size: 0.85rem;
                margin-top: 6px;
                display: flex;
                align-items: center;
                gap: 6px;
                animation: slideInUp 0.2s ease;
            `;
            input.parentElement.appendChild(errorMsg);
        }
        
        errorMsg.innerHTML = `<span>❌</span><span>${message}</span>`;
    }

    /**
     * Clear field error
     */
    clearFieldError(input) {
        input.classList.remove('error-field');
        input.style.borderColor = '';
        input.style.boxShadow = '';

        const errorMsg = input.parentElement.querySelector('.field-error');
        if (errorMsg) {
            errorMsg.style.animation = 'fadeIn 0.2s ease reverse';
            setTimeout(() => errorMsg.remove(), 200);
        }
    }

    /**
     * Validation methods
     */

    validateRequired(input) {
        if (!input.value || !input.value.trim()) {
            return { valid: false, message: 'This field is required' };
        }
        return { valid: true };
    }

    validateEmail(input) {
        if (!input.value) return { valid: true };
        const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!pattern.test(input.value)) {
            return { valid: false, message: 'Please enter a valid email address' };
        }
        return { valid: true };
    }

    validateNumber(input) {
        if (!input.value) return { valid: true };
        if (isNaN(input.value)) {
            return { valid: false, message: 'Please enter a valid number' };
        }
        return { valid: true };
    }

    validatePhone(input) {
        if (!input.value) return { valid: true };
        const pattern = /^\+?[\d\s\-()]{10,}$/;
        if (!pattern.test(input.value)) {
            return { valid: false, message: 'Please enter a valid phone number' };
        }
        return { valid: true };
    }

    validateUrl(input) {
        if (!input.value) return { valid: true };
        try {
            new URL(input.value);
            return { valid: true };
        } catch {
            return { valid: false, message: 'Please enter a valid URL' };
        }
    }

    validateMinLength(input) {
        if (!input.value) return { valid: true };
        const minLength = parseInt(input.getAttribute('minlength'));
        if (input.value.length < minLength) {
            return { valid: false, message: `Minimum ${minLength} characters required` };
        }
        return { valid: true };
    }

    validateMaxLength(input) {
        if (!input.value) return { valid: true };
        const maxLength = parseInt(input.getAttribute('maxlength'));
        if (input.value.length > maxLength) {
            return { valid: false, message: `Maximum ${maxLength} characters allowed` };
        }
        return { valid: true };
    }

    validatePattern(input) {
        if (!input.value) return { valid: true };
        const pattern = new RegExp(input.getAttribute('pattern'));
        if (!pattern.test(input.value)) {
            return { valid: false, message: 'Invalid format' };
        }
        return { valid: true };
    }

    validateLatitude(input) {
        if (!input.value) return { valid: true };
        const lat = parseFloat(input.value);
        if (isNaN(lat) || lat < -90 || lat > 90) {
            return { valid: false, message: 'Latitude must be between -90 and 90' };
        }
        return { valid: true };
    }

    validateLongitude(input) {
        if (!input.value) return { valid: true };
        const lng = parseFloat(input.value);
        if (isNaN(lng) || lng < -180 || lng > 180) {
            return { valid: false, message: 'Longitude must be between -180 and 180' };
        }
        return { valid: true };
    }

    validateCustomRequired(input) {
        // For custom validation logic
        const customValidator = input.getAttribute('data-custom-validate');
        if (customValidator && window[customValidator]) {
            const result = window[customValidator](input.value);
            if (!result.valid) {
                return { valid: false, message: result.message };
            }
        }
        return { valid: true };
    }

    /**
     * Get form data
     */
    getFormData() {
        const formData = new FormData(this.form);
        const data = {};
        
        for (const [key, value] of formData.entries()) {
            if (key in data) {
                if (!Array.isArray(data[key])) {
                    data[key] = [data[key]];
                }
                data[key].push(value);
            } else {
                data[key] = value;
            }
        }
        
        return data;
    }

    /**
     * Reset form
     */
    resetForm() {
        this.form.reset();
        
        this.form.querySelectorAll('input, select, textarea').forEach(input => {
            this.clearFieldError(input);
        });
        
        showSuccess('Form reset');
    }

    /**
     * Disable form
     */
    disableForm() {
        this.form.querySelectorAll('input, select, textarea, button').forEach(el => {
            el.disabled = true;
        });
    }

    /**
     * Enable form
     */
    enableForm() {
        this.form.querySelectorAll('input, select, textarea, button').forEach(el => {
            el.disabled = false;
        });
    }

    /**
     * Show field as valid
     */
    markFieldValid(fieldName) {
        const input = this.form.querySelector(`[name="${fieldName}"]`);
        if (input) {
            this.clearFieldError(input);
            input.style.borderColor = '#10b981';
        }
    }

    /**
     * Show field as invalid
     */
    markFieldInvalid(fieldName, message) {
        const input = this.form.querySelector(`[name="${fieldName}"]`);
        if (input) {
            this.showFieldError(input, message);
        }
    }
}

// Initialize form validators for all forms
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('form').forEach(form => {
            const validator = new FormValidator();
            validator.init(form);
            form.validator = validator;
        });
    });
} else {
    document.querySelectorAll('form').forEach(form => {
        const validator = new FormValidator();
        validator.init(form);
        form.validator = validator;
    });
}

console.log('✅ Form Validator module loaded');
