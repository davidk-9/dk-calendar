// assets/js/dk-enrolment.js

jQuery(document).ready(function($) {
    const $wrapper = $('#dk-enrolment-wrapper');
    if (!$wrapper.length || typeof DKEnrolmentData === 'undefined') return;

    // --- Core Data and State Management ---
    const STORAGE_KEY = 'dk_enrolment_state';
    const COURSE_COST_RAW = parseFloat($('#dk-step-1').data('instance-cost')) || 0;
    const SPACES_AVAIL = parseInt($('#dk-step-1').data('spaces-avail')) || 999;
    const INSTANCE_ID = $('#dk-step-1').data('instance-id');
    const COURSE_DATE = $('#dk-step-1').data('course-date') || '';
    const COURSE_TIME = $('#dk-step-1').data('course-time') || '';

    // API base: prefer configured DKEnrolmentData.api_base when Axcelerate/API sits on another host
    const API_BASE = (typeof DKEnrolmentData !== 'undefined' && DKEnrolmentData.api_base && DKEnrolmentData.api_base.length)
        ? DKEnrolmentData.api_base.replace(/\/$/, '')
        : window.location.origin;
    
    // Check if workshop start date/time is in the past
    function isWorkshopExpired() {
        if (!COURSE_DATE) {
            console.warn('Workshop date not available, allowing enrollment');
            return false;
        }
        
        try {
            // Combine date and time to create a full datetime
            let dateTimeString = COURSE_DATE;
            if (COURSE_TIME) {
                // If time contains a range (e.g. "12:45 am – 2:45 pm"), extract only the start time
                let startTime = COURSE_TIME;
                if (startTime.includes('–') || startTime.includes('-')) {
                    startTime = startTime.split(/[–-]/)[0].trim();
                }
                dateTimeString += ' ' + startTime;
            }
            
            // Parse the start date/time
            const startDateTime = new Date(dateTimeString);
            const now = new Date();
            
            // Check if the start date is valid and if it's in the past
            if (isNaN(startDateTime.getTime())) {
                console.warn('Invalid start date format, allowing enrollment:', dateTimeString);
                return false;
            }
            
            console.log('Workshop start time:', startDateTime, 'Current time:', now, 'Expired:', startDateTime < now);
            return startDateTime < now;
        } catch (e) {
            console.error('Error parsing workshop start date:', e);
            return false; // Allow enrollment if there's an error parsing the date
        }
    }
    
    // Show expired workshop message and hide enrollment form
    function showExpiredWorkshopMessage() {
        const courseName = $('#dk-step-1').data('instance-name') || 'this workshop';
        const courseCode = $('#dk-step-1').data('course-code') || '';
        const courseDate = COURSE_DATE || '';
        
        // Helper function to escape HTML - using the one defined later in the file
        const escapeText = function(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        };
        
        let message = '<div style="text-align: center; padding: 40px 20px;">';
        message += '<div style="font-size: 3em; color: #cd2996; margin-bottom: 20px;">⏰</div>';
        message += '<h2 style="color: #333; margin-bottom: 15px;">Workshop No Longer Available</h2>';
        message += '<p style="font-size: 1.1em; color: #666; margin-bottom: 10px;">Sorry, <strong>' + escapeText(courseCode ? courseCode + ' - ' + courseName : courseName) + '</strong></p>';
        if (courseDate) {
            message += '<p style="color: #999; margin-bottom: 25px;">scheduled for ' + escapeText(courseDate) + '</p>';
        }
        message += '<p style="color: #666; margin-bottom: 30px;">is no longer accepting bookings as it has already started or taken place.</p>';
        message += '<p style="font-size: 1.1em; margin-bottom: 30px;"><strong>Please visit our course calendar to find upcoming workshops.</strong></p>';
        message += '<a href="/" class="dk-btn dk-btn-primary" style="display: inline-block; padding: 12px 30px; text-decoration: none;">Return to Course Calendar</a>';
        message += '</div>';
        
        // Hide all step content and tab navigation
        $('.dk-tab-control-container').hide();
        
        // Show the message in the wrapper
        $('#dk-enrolment-wrapper').prepend('<div id="dk-expired-workshop-message" class="dk-enrolment-error" style="background: #fff3cd; border: 2px solid #ffc107; border-radius: 8px; margin: 20px 0;">' + message + '</div>');
    }
    
    // Run validation check immediately on page load
    if (isWorkshopExpired()) {
        console.warn('Workshop has expired, showing error message');
        showExpiredWorkshopMessage();
        return; // Exit early to prevent any enrollment functionality from loading
    }
    
    // JS proxy helpers: if server-side proxy is available we'll use WP AJAX actions to avoid exposing tokens client-side
    function proxyEnrol(paramsObj) {
        // paramsObj is an object of query params (instanceID, type, contactID, invoiceID, cost, discountIDList, payerID...)
        const data = Object.assign({ action: 'dk_proxy_enrol' }, paramsObj);
        return $.ajax({ url: DKEnrolmentData.ajax_url, type: 'POST', data: data, dataType: 'json' });
    }
    function proxyGetInvoice(invoiceID) {
        return $.ajax({ url: DKEnrolmentData.ajax_url, type: 'POST', dataType: 'json', data: { action: 'dk_proxy_invoice', invoiceID: invoiceID } });
    }
    function proxyGetPaymentForm(reference, invoiceGUID, redirectURL, cancelURL) {
        return $.ajax({ url: DKEnrolmentData.ajax_url, type: 'POST', dataType: 'json', data: { action: 'dk_proxy_payment_form', reference: reference, invoiceGUID: invoiceGUID, redirectURL: redirectURL, cancelURL: cancelURL } });
    }
    function proxyGetPaymentRef(reference) {
        return $.ajax({ url: DKEnrolmentData.ajax_url, type: 'POST', dataType: 'json', data: { action: 'dk_proxy_payment_ref', reference: reference } });
    }

    // Normalize WP AJAX wrapped responses ({ success: bool, data: ... }) to underlying data
    function unwrap(res) {
        if (res && typeof res === 'object' && ('success' in res)) return res.success ? res.data : res;
        return res;
    }
    // Helper: read invoice/ref from URL query params
    function getInvoiceRefFromUrl() {
        try {
            const qs = window.location.search.replace(/^\?/, '');
            if (!qs) return '';
            const parts = qs.split('&');
            for (let i = 0; i < parts.length; i++) {
                const p = parts[i].split('=');
                const k = decodeURIComponent(p[0] || '').toLowerCase();
                const v = typeof p[1] === 'undefined' ? '' : decodeURIComponent(p[1]);
                if (k === 'ref' || k === 'invoiceguid' || k === 'invguid') return v;
            }
        } catch (e) { /* ignore */ }
        return '';
    }
    // State shape: { payee: {...} | null, students: [ {...}, ... ] }
    let state = loadState();
    // transient flag to avoid duplicate promo re-application runs during render
    let promoResyncing = false;
    // Track which top-level flow is active: 'initial' | 'single' | 'someone' | 'group-setup' | 'group'
    let activeFlow = 'initial';

    function loadState() {
        try {
            return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || { payee: null, students: [], current_flow: null, flow_data: {} };
        } catch (e) {
            return { payee: null, students: [], current_flow: null, flow_data: {} };
        }
    }
    function saveState() {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function clearState() {
        state = { payee: null, students: [], current_flow: null, flow_data: {} };
        saveState();
    }

    // Validate functions (all fields mandatory; students require agreements)
    function validatePerson(data, isStudent) {
        if (!data) return false;
        if (!data.given_name || !data.last_name || !data.email || !data.mobile) return false;
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(data.email)) return false;
        if (isStudent) {
            if (!data.agreement_1 || !data.agreement_2) return false;
        }
        return true;
    }

    // Helper to check if two people are the same (by email, first name, last name)
    function isSamePerson(person1, person2) {
        if (!person1 || !person2) return false;
        const email1 = (person1.email || person1.emailAddress || '').trim().toLowerCase();
        const email2 = (person2.email || person2.emailAddress || '').trim().toLowerCase();
        const firstName1 = (person1.given_name || person1.givenName || '').trim().toLowerCase();
        const firstName2 = (person2.given_name || person2.givenName || '').trim().toLowerCase();
        const lastName1 = (person1.last_name || person1.lastName || person1.surname || '').trim().toLowerCase();
        const lastName2 = (person2.last_name || person2.lastName || person2.surname || '').trim().toLowerCase();
        return email1 && email2 && email1 === email2 && firstName1 === firstName2 && lastName1 === lastName2;
    }

    // Create new student object with proper initialization
    function createNewStudent() {
        return {
            enrollment_status: 'no',
            learner_id: null,
            enrolled_at: null
        };
    }

    // Lock status helper functions - check if data is immutable due to enrollments/invoice
    function hasAnyEnrollments() {
        if (!state.students || !state.students.length) return false;
        return state.students.some(function(s) {
            const status = s.enrollment_status || 'no';
            return status !== 'no';
        });
    }

    function isStudentEnrolled(studentIndex) {
        if (!state.students || !state.students[studentIndex]) return false;
        const status = state.students[studentIndex].enrollment_status || 'no';
        return status !== 'no';
    }

    function isPayeeLocked() {
        // Payee is locked if invoice exists (even if ID is 0 for 100% discounts)
        return (typeof state.invoiceID !== 'undefined' && state.invoiceID !== null);
    }

    function canNavigateBack() {
        return !hasAnyEnrollments() && !isPayeeLocked();
    }

    // Modal helper functions
    function showProcessModal(message) {
        let $modal = $('#dk-process-modal');
        if (!$modal.length) {
            $modal = $('<div id="dk-process-modal" class="dk-modal-overlay"></div>');
            const $content = $('<div class="dk-modal-content" style="text-align:center;"><div id="dk-process-message" style="margin-bottom:20px;"></div><button id="dk-process-close" class="dk-btn dk-btn-secondary" style="display:none;">Close</button></div>');
            $modal.append($content);
            $('body').append($modal);
            
            $('#dk-process-close').on('click', function() {
                if (confirm('Are you sure you want to close this? The process may still be running.')) {
                    $modal.hide();
                }
            });
        }
        $('#dk-process-message').html(message);
        $('#dk-process-close').hide();
        $modal.show();
        return $modal;
    }

    function updateProcessModal(message) {
        $('#dk-process-message').html(message);
    }

    function closeProcessModal() {
        $('#dk-process-modal').hide();
    }

    function enableProcessModalClose() {
        $('#dk-process-close').show();
    }

    function showErrorModal(message, onOkCallback) {
        let $modal = $('#dk-error-modal');
        if (!$modal.length) {
            $modal = $('<div id="dk-error-modal" class="dk-modal-overlay"></div>');
            const $content = $('<div class="dk-modal-content" style="text-align:center;"><div id="dk-error-message" style="margin-bottom:20px;color:red;"></div><button id="dk-error-ok" class="dk-btn dk-btn-primary">OK</button></div>');
            $modal.append($content);
            $('body').append($modal);
            $('#dk-error-ok').on('click', function() {
                $modal.hide();
                if (onOkCallback) onOkCallback();
            });
        }
        $('#dk-error-message').html(message);
        $modal.show();
    }

    function showConfirmModal(message, onYesCallback, onNoCallback) {
        let $modal = $('#dk-confirm-modal');
        if (!$modal.length) {
            $modal = $('<div id="dk-confirm-modal" class="dk-modal-overlay"></div>');
            const $content = $('<div class="dk-modal-content" style="text-align:center;"><div id="dk-confirm-message" style="margin-bottom:20px;"></div><div style="display:flex;gap:10px;justify-content:center;"><button id="dk-confirm-no" class="dk-btn dk-btn-secondary">No</button><button id="dk-confirm-yes" class="dk-btn dk-btn-primary">Yes</button></div></div>');
            $modal.append($content);
            $('body').append($modal);
        }
        
        // Remove old handlers and attach new ones
        $('#dk-confirm-yes').off('click').on('click', function() {
            $modal.hide();
            if (onYesCallback) onYesCallback();
        });
        $('#dk-confirm-no').off('click').on('click', function() {
            $modal.hide();
            if (onNoCallback) onNoCallback();
        });
        
        $('#dk-confirm-message').html(message);
        $modal.show();
    }

    // Render helpers: request a form HTML from server
    // Helper function to escape HTML for safe insertion
    function escapeHtml(str) {
        if (!str && str !== 0) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    // Generate detailed success message with personalized content
    function generateSuccessMessage() {
        // Get course details from the page data attributes
        const courseName = $('#dk-step-1').data('instance-name') || 'the selected course';
        const courseCode = $('#dk-step-1').data('course-code') || '';
        const courseDate = $('#dk-step-1').data('course-date') || '';
        const courseTime = $('#dk-step-1').data('course-time') || '';
        const courseLocation = $('#dk-step-1').data('course-location') || '';
        
        // Get payee name
        const payee = state.payee || (state.students && state.students.length ? state.students[0] : null);
        const payeeName = payee ? (payee.given_name || payee.givenName || '') + ' ' + (payee.last_name || payee.lastName || payee.surname || '') : 'valued customer';
        
        // Build student list
        const students = state.students || [];
        let studentListHtml = '';
        
        if (students.length > 0) {
            students.forEach(function(student) {
                const fullName = (student.given_name || student.givenName || '') + ' ' + (student.last_name || student.lastName || student.surname || '');
                studentListHtml += '<li style="margin: 5px 0;">' + escapeHtml(fullName.trim()) + '</li>';
            });
        }
        
        // Build the complete message
        let html = '<div style="text-align: left; max-width: 600px; margin: 0 auto;">';
        html += '<strong style="color:green; font-size: 1.2em;">Payment Successful — Thank You!</strong><br><br>';
        html += '<p style="margin: 10px 0;"><strong>Thank you ' + escapeHtml(payeeName.trim()) + ',</strong></p>';
        
        if (students.length > 0) {
            html += '<p style="margin: 10px 0;">The following ' + (students.length === 1 ? 'student has' : 'students have') + ' been successfully booked:</p>';
            html += '<ul style="list-style: none; padding-left: 0; margin: 10px 0 20px 0;">' + studentListHtml + '</ul>';
        }
        
        html += '<p style="margin: 10px 0;"><strong>Course Details:</strong></p>';
        html += '<div style="background: #f5f5f5; padding: 15px; border-radius: 4px; margin: 10px 0;">';
        
        if (courseCode) {
            html += '<p style="margin: 5px 0;"><strong>Course:</strong> ' + escapeHtml(courseCode) + ' - ' + escapeHtml(courseName) + '</p>';
        } else {
            html += '<p style="margin: 5px 0;"><strong>Course:</strong> ' + escapeHtml(courseName) + '</p>';
        }
        
        if (courseDate) {
            html += '<p style="margin: 5px 0;"><strong>Date:</strong> ' + escapeHtml(courseDate) + '</p>';
        }
        
        if (courseTime) {
            html += '<p style="margin: 5px 0;"><strong>Time:</strong> ' + escapeHtml(courseTime) + '</p>';
        }
        
        if (courseLocation) {
            html += '<p style="margin: 5px 0;"><strong>Location:</strong> ' + escapeHtml(courseLocation) + '</p>';
        }
        
        html += '</div>';
        html += '<p style="margin: 15px 0 0 0;"><em>Booking confirmations will be sent via email to both payee and students.</em></p>';
        html += '</div>';
        
        return html;
    }

    // Helper function: Update course header with discount info
    function updateCourseHeaderCost() {
        const students = state.students || [];
        if (students.length === 0) return;
        
        // Check if any student has a discount applied
        let hasDiscounts = false;
        let lowestDiscountedPrice = COURSE_COST_RAW;
        
        students.forEach(function(student) {
            if (typeof student.revised_price !== 'undefined' && student.revised_price !== null) {
                hasDiscounts = true;
                const revised = parseFloat(student.revised_price);
                if (revised < lowestDiscountedPrice) {
                    lowestDiscountedPrice = revised;
                }
            }
        });
        
        const $costDisplay = $('#dk-header-cost-display');
        const $costLabel = $('#dk-header-cost-label');
        
        if (hasDiscounts) {
            // Show original cost (strikethrough) and discounted cost
            const originalCostFormatted = '$' + COURSE_COST_RAW.toFixed(2);
            const discountedCostFormatted = '$' + lowestDiscountedPrice.toFixed(2);
            
            $costLabel.text('Cost/Student:');
            $costDisplay.html(
                '<span style="text-decoration: line-through; color: #999;">' + escapeHtml(originalCostFormatted) + '</span> ' +
                '<span style="color: #cd2996; font-weight: bold;">' + escapeHtml(discountedCostFormatted) + '</span>'
            );
        } else {
            // Reset to original display
            $costLabel.text('Cost/Student:');
            $costDisplay.html('$' + COURSE_COST_RAW.toFixed(2));
        }
    }

    // Helper function: Scroll to top of enrolment wrapper
    function scrollToEnrolmentTop() {
        const $wrapper = $('#dk-enrolment-wrapper');
        if ($wrapper.length) {
            $('html, body').animate({
                scrollTop: $wrapper.offset().top - 20
            }, 400);
        }
    }

    // Generate form HTML client-side (replaces server-side PHP rendering)
    function generateFormHTML(index, formType, title, data, isLocked, showDelete) {
        data = data || {};
        const disabled = isLocked ? 'disabled' : '';
        const studentNum = index + 1;
        
        // Determine title
        let finalTitle = title;
        if (!finalTitle) {
            if (formType === 'payee' || formType === 'booking_contact') {
                finalTitle = 'Your Details';
            } else {
                finalTitle = 'Student ' + studentNum;
            }
        }
        
        // Escape all data values for safe HTML insertion
        const givenName = escapeHtml(data.given_name || '');
        const lastName = escapeHtml(data.last_name || '');
        const email = escapeHtml(data.email || '');
        const mobile = escapeHtml(data.mobile || '');
        const agreement1Checked = (data.agreement_1) ? 'checked' : '';
        const agreement2Checked = (data.agreement_2) ? 'checked' : '';
        
        let html = '';
        html += '<div class="dk-student-form-block" data-index="' + index + '" data-is-locked="' + (isLocked ? 'true' : 'false') + '" data-form-type="' + escapeHtml(formType) + '">';
        html += '  <div class="dk-form-header">';
        html += '    <h3 class="dk-student-title">' + escapeHtml(finalTitle) + '</h3>';
        if (showDelete) {
            html += '    <button type="button" class="dk-btn dk-btn-delete dk-delete-student-btn" data-index="' + index + '">Delete Student</button>';
        }
        html += '  </div>';
        html += '  <form class="dk-student-form">';
        html += '    <div class="dk-form-section dk-two-column-layout">';
        
        // Given Name
        html += '      <div class="dk-form-field">';
        html += '        <label for="dk_given_name_' + index + '">Given Name*</label>';
        html += '        <input type="text" id="dk_given_name_' + index + '" name="given_name" value="' + givenName + '" ' + disabled + ' required>';
        html += '      </div>';
        
        // Last Name
        html += '      <div class="dk-form-field">';
        html += '        <label for="dk_last_name_' + index + '">Last Name*</label>';
        html += '        <input type="text" id="dk_last_name_' + index + '" name="last_name" value="' + lastName + '" ' + disabled + ' required>';
        html += '      </div>';
        
        // Email
        html += '      <div class="dk-form-field">';
        html += '        <label for="dk_email_' + index + '">Email Address*</label>';
        html += '        <input type="email" id="dk_email_' + index + '" name="email" value="' + email + '" ' + disabled + ' required>';
        html += '      </div>';
        
        // Mobile
        html += '      <div class="dk-form-field">';
        html += '        <label for="dk_mobile_' + index + '">Mobile*</label>';
        html += '        <input type="tel" id="dk_mobile_' + index + '" name="mobile" value="' + mobile + '" ' + disabled + ' required>';
        html += '      </div>';
        
        html += '    </div>'; // end two-column-layout
        
        // Agreements (only for student forms)
        html += '    <div class="dk-form-section dk-one-column-layout">';
        if (formType === 'student') {
            html += '      <div class="dk-checkbox-field">';
            html += '        <input type="checkbox" id="dk_agreement_1_' + index + '" name="agreement_1" value="1" ' + agreement1Checked + ' ' + disabled + ' required>';
            html += '        <label for="dk_agreement_1_' + index + '">I understand the online learning and assessment component of the course must be completed before I can attend my scheduled in person session.</label>';
            html += '      </div>';
            html += '      <div class="dk-checkbox-field">';
            html += '        <input type="checkbox" id="dk_agreement_2_' + index + '" name="agreement_2" value="1" ' + agreement2Checked + ' ' + disabled + ' required>';
            html += '        <label for="dk_agreement_2_' + index + '">I am physically able to perform CPR in a kneeling position on the floor for 2 minutes.</label>';
            html += '      </div>';
        }
        html += '    </div>'; // end one-column-layout
        
        html += '  </form>';
        html += '</div>';
        
        return html;
    }

    // Render multiple forms based on state (now fully client-side)
    function renderFormsForBooking(payeeIsStudent, isGroupFlow = false) {
        const $container = $('#dk-student-forms-container').empty();

        // If called as part of an explicit group flow, set the title accordingly
        if (isGroupFlow) {
            $('#dk-form-view-title').text('Booking for a Group');
        }
        
        // Build form list
        const forms = [];
        if (payeeIsStudent) {
            // First form is both student1 and payee
            forms.push({ index: 0, type: 'student', title: 'Your Details (Student 1 & Booking Contact)', data: state.students[0] || {}, showDelete: false });
            for (let i = 1; i < state.students.length; i++) {
                forms.push({ index: i, type: 'student', title: 'Student ' + (i+1) + ' Details', data: state.students[i] || {}, showDelete: true });
            }
        } else {
            // First form is booking contact (payee)
            forms.push({ index: 0, type: 'payee', title: 'Your Details (Booking Contact)', data: state.payee || {}, showDelete: false });
            for (let i = 0; i < state.students.length; i++) {
                forms.push({ index: i+1, type: 'student', title: 'Student ' + (i+1) + ' Details', data: state.students[i] || {}, showDelete: (i+1) > 1 });
            }
        }

        // Generate all forms instantly (no more AJAX delays!)
        forms.forEach(function(form) {
            const html = generateFormHTML(form.index, form.type, form.title, form.data, false, form.showDelete);
            $container.append(html);
        });
    }

    // Generic render for single-person bookings (book myself / someone else single student)
    function renderSingleFlow(showPayeeAsStudent, isBookForMyself) {
        // mark flow for navigation/back behavior
        activeFlow = isBookForMyself ? 'single' : 'someone';
        state.current_flow = isBookForMyself ? 'step1-myself' : 'step1-someone';
        state.flow_data = state.flow_data || {};
        state.flow_data.base_flow = activeFlow; // Preserve for step 2 navigation
        saveState();
        
        $('#dk-step-1-initial-view, #dk-step-1-group-setup').hide();
        $('#dk-step-1-form-view').show();
        $('#dk-form-view-title').text(isBookForMyself ? 'Book for Myself' : (showPayeeAsStudent ? 'Book For Someone Else' : 'Booking'));
        const $container = $('#dk-student-forms-container').empty();

        if (isBookForMyself) {
            // Initialize student if needed
            if (!state.students[0]) state.students[0] = createNewStudent();
            // Generate student form instantly
            const html = generateFormHTML(0, 'student', 'Your Details (Student)', state.students[0] || {}, false, false);
            $container.append(html);
            $('#dk-add-new-student-btn').hide();
        } else {
            // Booking contact + student
            // Generate booking contact form
            const payeeHtml = generateFormHTML(0, 'payee', 'Your Details (Booking Contact)', state.payee || {}, false, false);
            $container.append(payeeHtml);
            // Initialize student if needed
            if (!state.students[0]) state.students[0] = createNewStudent();
            // Generate student form (do NOT show delete button — always require at least one student)
            const studentHtml = generateFormHTML(1, 'student', 'Student Details', state.students[0] || {}, false, false);
            $container.append(studentHtml);
            $('#dk-add-new-student-btn').hide();
        }
    }

    // --- Event handlers for initial buttons ---
    $wrapper.on('click', '#dk-book-myself-btn', function() {
        clearState();
        // Show single student form; this person is both student1 and payee
        activeFlow = 'single';
        renderSingleFlow(true, true);
    });

    $wrapper.on('click', '#dk-book-someone-btn', function() {
        clearState();
        activeFlow = 'someone';
        renderSingleFlow(true, false);
    });

    $wrapper.on('click', '#dk-book-group-btn', function() {
        state.current_flow = 'step1-group-setup';
        saveState();
        
        $('#dk-step-1-initial-view').hide();
        $('#dk-step-1-group-setup').show();
        // set default and bounds
        const max = Math.max(2, Math.min(SPACES_AVAIL, 999));
        $('#dk_group_count').attr('max', max).val(2);
    });

    // Group number controls
    $wrapper.on('click', '#dk_group_count_incr', function() {
        const max = parseInt($('#dk_group_count').attr('max')) || SPACES_AVAIL;
        let val = parseInt($('#dk_group_count').val()) || 2;
        if (val < max) $('#dk_group_count').val(val + 1);
    });
    $wrapper.on('click', '#dk_group_count_decr', function() {
        let val = parseInt($('#dk_group_count').val()) || 2;
        if (val > 2) $('#dk_group_count').val(val - 1);
    });

    $wrapper.on('click', '#dk-group-go-back-btn', function() {
        $('#dk-step-1-group-setup').hide();
        $('#dk-step-1-initial-view').show();
        activeFlow = 'initial';
        // User went back to top-level buttons — clear transient group state
        clearState();
    });

    // Continue from group setup
    $wrapper.on('click', '#dk-group-continue-btn', function() {
        const count = Math.max(2, Math.min(parseInt($('#dk_group_count').val()) || 2, parseInt($('#dk_group_count').attr('max')) || SPACES_AVAIL));
        const partOfGroup = $('input[name="dk_group_member_toggle"]:checked').val() === 'yes';

        // Build state arrays while preserving any known data:
        // - If partOfGroup: payee is students[0]. Preserve existing payee or students into the new students slots.
        // - If payee separate: preserve state.payee if present, otherwise promote students[0] to payee.
        let newPayee = null;
        let newStudents = [];

        if (partOfGroup) {
            // Known people: if there was a separate payee previously, prefer that first, then existing students
            const known = [];
            if (state.payee && Object.keys(state.payee).length) known.push(state.payee);
            if (state.students && state.students.length) known.push.apply(known, state.students);
            for (let i = 0; i < count; i++) {
                if (known[i]) newStudents.push(known[i]); else newStudents.push(createNewStudent());
            }
            newPayee = null; // payee is represented as student[0]
        } else {
            // payee separate
            if (state.payee && Object.keys(state.payee).length) {
                newPayee = state.payee;
                const knownStudents = state.students ? state.students.slice() : [];
                for (let i = 0; i < count; i++) {
                    if (knownStudents[i]) newStudents.push(knownStudents[i]); else newStudents.push(createNewStudent());
                }
            } else if (state.students && state.students.length) {
                // promote first existing student to be payee and shift remaining students
                newPayee = state.students[0];
                const remaining = state.students.slice(1);
                for (let i = 0; i < count; i++) {
                    if (remaining[i]) newStudents.push(remaining[i]); else newStudents.push(createNewStudent());
                }
            } else {
                // no known data
                newPayee = {};
                for (let i = 0; i < count; i++) newStudents.push(createNewStudent());
            }
        }

        // Trim trailing empty students if new count is smaller than before
        // (the above construction already set exact length)
        state.payee = newPayee;
        state.students = newStudents;
        state.current_flow = 'step1-group-forms';
        state.flow_data = { group_count: count, payee_is_student: partOfGroup, base_flow: 'group' };
        saveState();

        // Render forms accordingly and show form-view
        $('#dk-step-1-group-setup').hide();
        $('#dk-step-1-form-view').show();
        $('#dk-add-new-student-btn').show();
        activeFlow = 'group';
        // Render forms: using renderFormsForBooking (mark as group flow so title updates)
        renderFormsForBooking(partOfGroup, true);
    });

    // Add new student button (in group flows)
    $wrapper.on('click', '#dk-add-new-student-btn', function() {
        if (state.students.length >= SPACES_AVAIL) { alert('Maximum number of students reached!'); return; }
        state.students.push(createNewStudent());
        saveState();
        // Generate form for next index
        const newIndex = state.students.length - 1 + (state.payee ? 1 : 0);
        const title = 'Student ' + (state.students.length) + ' Details';
        const html = generateFormHTML(newIndex, 'student', title, {}, false, true);
        $('#dk-student-forms-container').append(html);
    });

    // Delete student handler (delegated)
    $wrapper.on('click', '.dk-delete-student-btn', function() {
        const idx = parseInt($(this).data('index'));
        
        // Determine which logical student to remove based on presence of payee
        let studentIdx = idx;
        if (state.payee) {
            studentIdx = idx - 1; // First form is payee, students start at index 1
        }
        
        // Check if this student is enrolled - cannot delete if enrolled
        if (studentIdx >= 0 && isStudentEnrolled(studentIdx)) {
            alert('Cannot delete this student - they have been enrolled. Please contact support if changes are needed.');
            return;
        }
        
        // Determine which logical student to remove based on presence of payee
        if (state.payee) {
            // first form is payee, students start at index 1 in DOM
            const studentIndex = idx - 1;
            if (studentIndex >= 0 && studentIndex < state.students.length) {
                state.students.splice(studentIndex,1);
            }
        } else {
            // no payee, students indexed directly
            if (idx >= 0 && idx < state.students.length) state.students.splice(idx,1);
        }
        saveState();
        // Re-render based on whether payee is student or not
        const payeeIsStudent = !state.payee && state.students.length>0;
        renderFormsForBooking(payeeIsStudent);
    });

    // Go back from form view
    $wrapper.on('click', '#dk-go-back-btn', function() {
        // Check if we can navigate back - prevent if enrollments exist
        if (!canNavigateBack() && activeFlow !== 'group') {
            alert('Cannot go back - enrollments have been created. Student details are locked. Please contact support if you need to make changes.');
            return;
        }
        
        // If we came from a group setup, save current inputs WITHOUT validation
        if (activeFlow === 'group') {
            const forms = $('#dk-student-forms-container .dk-student-form');
            const collected = [];
            forms.each(function(i, form) {
                const $f = $(form);
                const fd = {};
                $f.serializeArray().forEach(function(item){ fd[item.name]=item.value; });
                fd.agreement_1 = $f.find('input[name="agreement_1"]').is(':checked');
                fd.agreement_2 = $f.find('input[name="agreement_2"]').is(':checked');
                const isStudent = $f.closest('.dk-student-form-block').data('form-type') === 'student';
                collected.push({ data: fd, isStudent: isStudent });
            });

            // Map collected to state the same way Save Details does, but without validation
            const firstBlock = $('#dk-student-forms-container .dk-student-form-block').first();
            const firstType = firstBlock.length ? firstBlock.data('form-type') : null;
            if (firstType === 'payee') {
                state.payee = collected[0] ? collected[0].data : {};
                state.students = collected.slice(1).map(x => x.data);
            } else {
                state.students = collected.map(x => x.data);
                state.payee = collected[0] ? collected[0].data : {};
            }
            saveState();

            // Show group setup so user can tweak numbers/membership
            $('#dk-step-1-form-view').hide();
            $('#dk-student-forms-container').empty();
            $('#dk-step-1-group-setup').show();
        } else {
            // Non-group flows: clear transient state and return to initial
            $('#dk-step-1-form-view').hide();
            $('#dk-student-forms-container').empty();
            $('#dk-step-1-initial-view').show();
            clearState();
            activeFlow = 'initial';
        }
    });

    // Save Details (single flow) and Continue (group flow confirmation handled here)
    $wrapper.on('click', '#dk-save-details-btn', function() {
        // Collect currently visible forms and validate
        const forms = $('#dk-student-forms-container .dk-student-form');
        const collected = [];
        let valid = true;
        forms.each(function(i, form) {
            const $f = $(form);
            const fd = {};
            $f.serializeArray().forEach(function(item){ fd[item.name]=item.value; });
            // checkbox handling
            fd.agreement_1 = $f.find('input[name="agreement_1"]').is(':checked');
            fd.agreement_2 = $f.find('input[name="agreement_2"]').is(':checked');
            const isStudent = $f.closest('.dk-student-form-block').data('form-type') === 'student';
            if (!validatePerson(fd, isStudent)) { valid = false; return false; }
            collected.push({ data: fd, isStudent: isStudent });
        });
        if (!valid) { $('#dk-validation-message').text(DKEnrolmentData.messages.validation_error).fadeIn(); return; }

        // Ensure all entered email addresses are unique across payee and students
        const emails = collected.map(function(c){ return (c.data.email||'').trim().toLowerCase(); }).filter(Boolean);
        const seen = {};
        let duplicateFound = false;
        for (let i=0;i<emails.length;i++) {
            if (seen[emails[i]]) { duplicateFound = true; break; }
            seen[emails[i]] = true;
        }
        if (duplicateFound) {
            $('#dk-validation-message').text('Each person must use a unique email address. Please ensure payee and student emails differ.').fadeIn();
            return;
        }

        $('#dk-validation-message').fadeOut();

        // Save into state: heuristics based on form types
        const firstBlock = $('#dk-student-forms-container .dk-student-form-block').first();
        const firstType = firstBlock.data('form-type');
        if (firstType === 'payee') {
            // first is payee
            state.payee = collected[0].data;
            state.students = collected.slice(1).map(x => x.data);
        } else {
            // first is student and also payee
            state.students = collected.map(x => x.data);
            state.payee = collected[0].data;
        }
        saveState();

        // Decide whether to proceed to step 2 immediately or confirm (group flows should confirm)
        // If we are in a group flow (add button visible) then show confirmation modal
        if ($('#dk-add-new-student-btn').is(':visible')) {
            // show confirmation
            const $modal = $('<div class="dk-modal-overlay"></div>');
            const $content = $(`
                <div class="dk-modal-content">
                    <p>${DKEnrolmentData.messages.final_check}</p>
                    <div class="dk-button-group">
                        <button class="dk-btn dk-btn-primary dk-confirm-yes">Yes</button>
                        <button class="dk-btn dk-btn-secondary dk-confirm-no">No</button>
                    </div>
                </div>
            `);
            $content.find('.dk-confirm-yes').on('click', function(){ $modal.remove(); goToStep(2); });
            $content.find('.dk-confirm-no').on('click', function(){ $modal.remove(); });
            $modal.append($content); $('body').append($modal);
        } else {
            // immediate continue
            goToStep(2);
        }
    });

    // Edit student link on step 2 will simply go back to step 1
    $wrapper.on('click', '.dk-edit-student-link', function(e){ e.preventDefault(); goToStep(1); });

    // Page refresh recovery - restore user's position based on current_flow
    if (state.current_flow) {
        if (state.current_flow.startsWith('step2')) {
            // User was on step 2, but we need to prepare step 1's state first so "back" button works
            // Use flow_data.base_flow to determine which flow they came from
            const baseFlow = (state.flow_data && state.flow_data.base_flow) || 'single';
            
            if (baseFlow === 'single') {
                // Book myself flow
                activeFlow = 'single';
                $('#dk-step-1-initial-view').hide();
                $('#dk-step-1-form-view').show();
                $('#dk-form-view-title').text('Book for Myself');
                $('#dk-add-new-student-btn').hide();
                renderFormsForBooking(true, false); // payeeIsStudent=true, isGroupFlow=false
            } else if (baseFlow === 'group') {
                // Group flow
                activeFlow = 'group';
                $('#dk-step-1-initial-view').hide();
                $('#dk-step-1-form-view').show();
                $('#dk-form-view-title').text('Group Booking');
                $('#dk-add-new-student-btn').show();
                const payeeIsStudent = state.flow_data.payee_is_student || (!state.payee && state.students.length > 0);
                renderFormsForBooking(payeeIsStudent, true); // isGroupFlow=true
            } else {
                // Book someone else flow
                activeFlow = 'someone';
                $('#dk-step-1-initial-view').hide();
                $('#dk-step-1-form-view').show();
                $('#dk-form-view-title').text('Book For Someone Else');
                $('#dk-add-new-student-btn').hide();
                renderFormsForBooking(false, false); // payeeIsStudent=false, isGroupFlow=false
            }
            
            // Now navigate to step 2
            goToStep(2);
        } else if (state.current_flow === 'step1-myself') {
            // User was in "book myself" flow
            activeFlow = 'single';
            $('#dk-step-1-initial-view').hide();
            $('#dk-step-1-form-view').show();
            $('#dk-form-view-title').text('Book for Myself');
            $('#dk-add-new-student-btn').hide();
            renderFormsForBooking(true, false); // payeeIsStudent=true, isGroupFlow=false
            scrollToEnrolmentTop(); // Manual scroll for step 1 restoration
        } else if (state.current_flow === 'step1-someone') {
            // User was in "book someone else" flow
            activeFlow = 'someone';
            $('#dk-step-1-initial-view').hide();
            $('#dk-step-1-form-view').show();
            $('#dk-form-view-title').text('Book For Someone Else');
            $('#dk-add-new-student-btn').hide();
            renderFormsForBooking(false, false); // payeeIsStudent=false, isGroupFlow=false
            scrollToEnrolmentTop(); // Manual scroll for step 1 restoration
        } else if (state.current_flow === 'step1-group-setup') {
            // User was on group setup screen
            $('#dk-step-1-initial-view').hide();
            $('#dk-step-1-group-setup').show();
            const max = Math.max(2, Math.min(SPACES_AVAIL, 999));
            $('#dk_group_count').attr('max', max).val(state.flow_data.group_count || 2);
            if (state.flow_data.payee_is_student !== undefined) {
                $('input[name="dk_group_member_toggle"][value="' + (state.flow_data.payee_is_student ? 'yes' : 'no') + '"]').prop('checked', true);
            }
            scrollToEnrolmentTop(); // Manual scroll for step 1 restoration
        } else if (state.current_flow === 'step1-group-forms') {
            // User was filling in group forms
            activeFlow = 'group';
            $('#dk-step-1-initial-view').hide();
            $('#dk-step-1-form-view').show();
            $('#dk-form-view-title').text('Group Booking');
            $('#dk-add-new-student-btn').show();
            const payeeIsStudent = state.flow_data.payee_is_student || (!state.payee && state.students.length > 0);
            renderFormsForBooking(payeeIsStudent, true); // isGroupFlow=true
            scrollToEnrolmentTop(); // Manual scroll for step 1 restoration
        }
    } else if (state.payee || (state.students && state.students.length>0)) {
        // Fallback: If we have saved data but no current_flow, go to step 1 and render forms accordingly
        const payeeIsStudent = !state.payee && (state.students && state.students.length>0);
        // If there are multiple students, assume this was a group flow
        if (state.students && state.students.length > 1) activeFlow = 'group';
        $('#dk-step-1-initial-view').hide();
        $('#dk-step-1-form-view').show();
        $('#dk-add-new-student-btn').toggle( (state.students.length>1) );
        renderFormsForBooking(payeeIsStudent, activeFlow === 'group');
        scrollToEnrolmentTop(); // Manual scroll for step 1 restoration
    }

    // Detect return from hosted checkout (e.g. Stripe) via URL query params
    // If a `ref` (invoice GUID) is present, persist it and open Step 3 so the
    // existing renderStep3() logic will auto-check payment/ref via the proxy.
    (function handleReturnFromHostedCheckout(){
        function getQueryParams() {
            const params = {};
            const qs = window.location.search.replace(/^\?/, '');
            if (!qs) return params;
            qs.split('&').forEach(function(pair){
                if (!pair) return;
                const parts = pair.split('=');
                const k = decodeURIComponent(parts[0] || '');
                const v = typeof parts[1] === 'undefined' ? '' : decodeURIComponent(parts[1]);
                if (k) params[k] = v;
            });
            return params;
        }

        try {
            const qp = getQueryParams();
            const ref = qp.ref || qp.invoiceGUID || qp.invguid || '';
            const st = (qp.state || '').toLowerCase();
            if (ref) {
                // Persist invoiceGUID to state so the first check can run.
                state.invoiceGUID = ref;
                saveState();
                console.debug('Detected hosted-checkout return: ref=', ref, 'state=', st);
                // Preserve invoice GUID in the URL so re-attempts can rely on it.
                try {
                    const qs = '?ref=' + encodeURIComponent(ref) + (st ? ('&state=' + encodeURIComponent(st)) : '');
                    const clean = window.location.origin + window.location.pathname + qs + window.location.hash;
                    history.replaceState({}, document.title, clean);
                } catch (e) { /* ignore */ }
                // Move user to Step 3 which will trigger the payment/ref check
                goToStep(3);
            }
        } catch (e) {
            console.error('handleReturnFromHostedCheckout error', e);
        }
    })();

    // --- Navigation: goToStep and Step 2 renderer ---
    function goToStep(step) {
        if (step < 1 || step > 3) return;
        
        // Track flow state - preserve base flow info
        if (step === 2) {
            state.current_flow = 'step2-init';
            // Ensure base_flow is set if not already
            if (!state.flow_data.base_flow) {
                // Infer from current state
                if (!state.payee && state.students.length === 1) {
                    state.flow_data.base_flow = 'single';
                } else if (state.students.length > 1) {
                    state.flow_data.base_flow = 'group';
                } else {
                    state.flow_data.base_flow = 'someone';
                }
            }
            saveState();
        }
        
        // Hide all step contents and clear active tabs
        $('.dk-step-content').hide();
        $('.dk-tab-item').removeClass('dk-active-tab');

        // Show selected content and mark tab active
        $(`#dk-step-${step}`).show();
        $(`.dk-tab-item.dk-step-${step}`).addClass('dk-active-tab');

        if (step === 2) {
            renderStep2();
        }
        if (step === 3) {
            renderStep3();
        }
        
        // Scroll to top of enrolment form
        scrollToEnrolmentTop();
    }

    // Render Step 3: payment / result viewer
    function renderStep3() {
        const $step3 = $('#dk-step-3').empty();
        let html = '';
        html += '<div class="dk-summary-section">';
        html += '<h3>Payment & Confirmation</h3>';
        html += '<div class="dk-title-line"></div>';
        html += '<p id="dk-payment-status-message">Verifying payment status...</p>';
        html += '</div>';

        html += '<div style="margin-top:12px;">';
        html += '<button id="dk-check-payment-status" class="dk-btn dk-btn-secondary">Check Payment Status</button>';
        html += '</div>';

        $step3.append(html);

        $('#dk-check-payment-status').off('click').on('click', function(){
            checkPaymentAndFinalize();
        });

        // Check if enrollments are already confirmed (100% discount scenario)
        const allConfirmed = state.students && state.students.length > 0 && 
            state.students.every(function(s){ return s.enrollment_status === 'confirmed'; });
        
        if (allConfirmed) {
            // Enrollments already finalized (no payment required) - show success immediately
            console.log('Enrollments already confirmed - showing success message');
            $('#dk-payment-status-message').html(generateSuccessMessage());
            $('#dk-check-payment-status').prop('disabled', true).hide();
            try { clearState(); } catch (e) { console.error('Failed to clear state', e); }
        } else {
            // Normal flow - auto-check if we already have an invoiceGUID (either in state or URL)
            if (state.invoiceGUID || getInvoiceRefFromUrl()) {
                $('#dk-check-payment-status').trigger('click');
            }
        }
    }

    // Check payment status and finalize enrollments if paid
    function checkPaymentAndFinalize() {
        const ref = state.invoiceGUID || getInvoiceRefFromUrl() || '';
        if (!ref) {
            $('#dk-payment-status-message').text('No invoice GUID available to check.');
            return;
        }
        
        // Show modal while verifying
        showProcessModal('Verifying payment status from Stripe...');
        
        // use proxy that keeps tokens server-side
        proxyGetPaymentRef(ref).done(function(r){
            const payload = unwrap(r);
            // Log to console instead of showing in UI
            console.log('Payment Status Response:', JSON.stringify(payload, null, 2));
            
            try {
                const stateVal = payload && payload.STATE ? payload.STATE.toLowerCase() : null;

                    if (stateVal === 'paid') {
                        // Payment confirmed - now finalize all enrollments
                        updateProcessModal('Payment confirmed! Finalizing enrollments...');
                        
                        const students = state.students || [];
                        const payeeContact = state.payee ? (state.payee.ax_contact_id || state.payee.ax_contact) : null;
                        const invoiceID = (typeof state.invoiceID !== 'undefined' && state.invoiceID !== null) ? state.invoiceID : '';
                        
                        if (!students.length || invoiceID === '') {
                            console.error('Cannot finalize: missing students or invoiceID', { students, invoiceID });
                            closeProcessModal();
                            $('#dk-payment-status-message').html(generateSuccessMessage());
                            try { clearState(); } catch (e) { console.error('Failed to clear state after paid', e); }
                            $('#dk-check-payment-status').prop('disabled', true).hide();
                            $('#dk-payment-form-container, #dk-external-payment-form').remove();
                            return;
                        }
                        
                        // Finalize all students with tentative=false and suppressNotifications=false
                        // Build list of students to finalize
                        const studentsToFinalize = [];
                        students.forEach(function(student, idx) {
                            const contactID = student.ax_contact_id || student.ax_contact || 0;
                            if (!contactID) {
                                console.warn('Skipping finalization for student without contactID at index', idx);
                                return;
                            }
                            
                            const params = [];
                            params.push('instanceID=' + encodeURIComponent(INSTANCE_ID));
                            params.push('type=w');
                            params.push('contactID=' + encodeURIComponent(contactID));
                            params.push('invoiceID=' + encodeURIComponent(invoiceID));
                            params.push('tentative=0');
                            params.push('suppressNotifications=0');
                            params.push('blockAdminNotification=true');
                            if (payeeContact && payeeContact !== contactID) params.push('payerID=' + encodeURIComponent(payeeContact));
                            if (typeof student.revised_price !== 'undefined' && student.revised_price !== null) params.push('cost=' + encodeURIComponent(parseFloat(student.revised_price).toFixed(2)));
                            if (student.discount_id) params.push('discountIDList=' + encodeURIComponent(student.discount_id));
                            
                            const paramsObj = {};
                            params.forEach(function(p){ const parts = p.split('='); paramsObj[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1] || ''); });
                            console.debug('Preparing finalization for student', idx, paramsObj);
                            
                            studentsToFinalize.push({ idx: idx, paramsObj: paramsObj });
                        });
                        
                        // Finalize enrollments sequentially to avoid race conditions
                        let finalizeChain = $.Deferred().resolve().promise();
                        studentsToFinalize.forEach(function(studentData) {
                            finalizeChain = finalizeChain.then(function() {
                                console.log('Finalizing enrollment for student', studentData.idx);
                                return proxyEnrol(studentData.paramsObj).fail(function(xhr){
                                    console.error('Failed to finalize enrollment for student', studentData.idx, xhr && xhr.responseText);
                                });
                            });
                        });
                        
                        finalizeChain.always(function(){
                            console.log('All enrollments finalized');
                            closeProcessModal();
                            $('#dk-payment-status-message').html(generateSuccessMessage());
                            try { clearState(); } catch (e) { console.error('Failed to clear state after paid', e); }
                            $('#dk-check-payment-status').prop('disabled', true).hide();
                            $('#dk-payment-form-container, #dk-external-payment-form').remove();
                        });
                    } else if (stateVal === 'pending') {
                        // Keep UI available to re-check, but we can clear transient storage as booking is recorded.
                        closeProcessModal();
                        $('#dk-payment-status-message').html('<strong style="color:orange;">Payment Pending</strong><br>Your booking is confirmed — payment is pending and may take a while to process. You can check status or close this window; our admin will contact you if there is an issue.');
                        try { clearState(); } catch (e) { console.error('Failed to clear state after pending', e); }
                        // Keep check button visible so user can retry checking; rely on URL ref for subsequent checks.
                        $('#dk-check-payment-status').prop('disabled', false).show();
                    } else if (stateVal === 'failed') {
                        // Payment failed — preserve session state so user can retry or cancel enrolment.
                        closeProcessModal();
                        $('#dk-payment-status-message').html('<strong style="color:red;">Payment Failed</strong><br>Your booking/enrolment is confirmed but payment has failed. You can try another payment method or cancel your enrolment.');
                        // Show action buttons: Retry Payment and Cancel Enrolment
                        const $actions = $(
                            '<div id="dk-failed-actions" style="margin-top:12px;">'
                            + '<button id="dk-retry-payment-btn" class="dk-btn dk-btn-primary" style="margin-right:8px;">Pay Now</button>'
                            + '<button id="dk-cancel-enrolment-btn" class="dk-btn dk-btn-secondary">Cancel Enrolment</button>'
                            + '</div>'
                        );
                        $('#dk-failed-actions').remove();
                        $('#dk-payment-status-message').after($actions);

                        // Retry: regenerate hosted payment form for the same invoiceGUID/reference
                        $('#dk-retry-payment-btn').off('click').on('click', function(e){
                            e.preventDefault();
                            const refRetry = state.invoiceGUID || getInvoiceRefFromUrl();
                            if (!refRetry) { alert('No invoice reference available to retry payment.'); return; }
                            
                            showProcessModal('Requesting alternate payment methods...');
                            const currentUrl = window.location.href;
                            proxyGetPaymentForm(refRetry, refRetry, currentUrl, currentUrl).done(function(formRes){
                                const formPayload = unwrap(formRes);
                                if (formPayload && formPayload.SUCCESS && formPayload.DATA) {
                                    // Auto-redirect to payment form
                                    updateProcessModal('Redirecting to secure payment...');
                                    $('#dk-payment-form-container').remove();
                                    
                                    const action = formPayload.DATA.ACTION || '';
                                    const method = (formPayload.DATA.FORMMETHOD || 'POST').toUpperCase();
                                    const innerHtml = formPayload.DATA.HTML || '';
                                    
                                    // Create hidden form
                                    const $container = $('<div id="dk-payment-form-container" style="display:none;"></div>');
                                    const $form = $('<form id="dk-external-payment-form"></form>');
                                    $form.attr('action', action).attr('method', method).html(innerHtml);
                                    
                                    if ($form.find('input.ax-ecommerce-pay-btn[type="submit"]').length === 0) {
                                        const $submit = $('<input type="submit" class="ax-ecommerce-pay-btn" value="Pay Now" />');
                                        $form.append($submit);
                                    }
                                    
                                    $container.append($form);
                                    $('body').append($container);
                                    
                                    // Close modal before redirect
                                    setTimeout(function(){
                                        closeProcessModal();
                                    }, 1000);
                                    
                                    // Auto-submit after script initialization
                                    setTimeout(function(){
                                        if (typeof AX_CHECKOUT !== 'undefined' && AX_CHECKOUT.submitPaymentForm) {
                                            AX_CHECKOUT.submitPaymentForm($form[0]);
                                        } else {
                                            $form[0].method = 'get';
                                            $form[0].submit();
                                        }
                                    }, 1500);
                                } else {
                                    updateProcessModal('Failed to obtain payment form. See console.');
                                    enableProcessModalClose();
                                    console.error('Retry payment form error', formPayload);
                                }
                            }).fail(function(xhr){ 
                                console.error('Retry payment form request failed', xhr && xhr.responseText); 
                                updateProcessModal('Failed to obtain payment form.');
                                enableProcessModalClose();
                            });
                        });

                        // Cancel enrolment: call API for each student, clear local state regardless
                        $('#dk-cancel-enrolment-btn').off('click').on('click', function(e){
                            e.preventDefault();
                            if (!confirm('Cancel enrolment? This will notify administrators to process cancellation.')) return;

                            showProcessModal('Cancelling enrolment...');

                            const students = state.students || [];
                            const ops = [];
                            const failures = [];

                            if (!students.length) {
                                // Nothing to cancel — still clear local state and inform user
                                clearState();
                                closeProcessModal();
                                $('#dk-payment-status-message').text('Your booking has been cancelled.');
                                console.debug('Cancel enrolment: no students found in state to cancel.');
                                $('#dk-payment-form-container, #dk-external-payment-form').remove();
                                $('#dk-check-payment-status').prop('disabled', true).hide();
                                $('#dk-failed-actions').remove();
                                return;
                            }

                            students.forEach(function(s, idx){
                                const contactID = s.ax_contact_id || s.ax_contact || s.contactID || 0;
                                if (!contactID) {
                                    failures.push({ idx: idx, reason: 'missing contactID', student: s });
                                    console.error('Cancellation skipped: missing contactID for student index', idx, s);
                                    return;
                                }

                                const ajax = $.ajax({
                                    url: API_BASE + '/api/course/enrolment',
                                    type: 'POST',
                                    dataType: 'json',
                                    data: {
                                        instanceID: INSTANCE_ID,
                                        contactID: contactID,
                                        type: 'w',
                                        logType: 'Cancelled'
                                    }
                                }).done(function(res){
                                    let r = res;
                                    if (typeof r === 'string') {
                                        try { r = JSON.parse(r); } catch (e) { /* ignore parse error */ }
                                    }
                                    const statusVal = (r && (r.STATUS || r.Status || r.status)) ? String(r.STATUS || r.Status || r.status).toLowerCase() : '';
                                    if (statusVal !== 'success') {
                                        failures.push({ idx: idx, contactID: contactID, response: r });
                                        console.error('Cancellation API returned non-success for contact', contactID, r);
                                    }
                                }).fail(function(xhr){
                                    failures.push({ idx: idx, contactID: contactID, responseText: xhr && xhr.responseText });
                                    console.error('Cancellation AJAX failed for contact', contactID, xhr && xhr.responseText);
                                });

                                ops.push(ajax);
                            });

                            // Wait for all cancellation ops to finish
                            $.when.apply($, ops.length ? ops : [$.Deferred().resolve()]).always(function(){
                                // Clear client-side state regardless of cancellation outcomes
                                try { clearState(); } catch (e) { console.error('Failed to clear state after cancellation', e); }

                                closeProcessModal();
                                
                                if (failures.length === 0) {
                                    $('#dk-payment-status-message').text('Your booking has been cancelled successfully.');
                                } else {
                                    // Log details for investigation, but show a neutral message to the user per spec
                                    console.warn('One or more cancellations failed or returned non-success:', failures);
                                    $('#dk-payment-status-message').text('Your booking has been cancelled.');
                                }

                                // Cleanup UI
                                $('#dk-payment-form-container, #dk-external-payment-form').remove();
                                $('#dk-check-payment-status').prop('disabled', true).hide();
                                $('#dk-failed-actions').remove();
                            });
                        });
                    }
                } catch (e) { 
                    closeProcessModal();
                    console.error('Error handling payment state', e); 
                    $('#dk-payment-status-message').html('<strong style="color:red;">Error</strong><br>An error occurred processing the payment status.');
                }
        }).fail(function(xhr){
            closeProcessModal();
            $('#dk-payment-status-message').html('<strong style="color:red;">Error</strong><br>Failed to fetch payment status. See console for details.');
            console.error('Payment status fetch failed', xhr && xhr.responseText);
        });
    }

    function renderStep2() {
        const $step2 = $('#dk-step-2').empty();
        let html = '';

        // Payee summary
        const payee = state.payee || (state.students && state.students.length ? state.students[0] : null);
        html += '<div class="dk-summary-section">';
        html += '<h3>Payee Details</h3>';
        html += '<div class="dk-title-line"></div>';
        if (payee) {
            html += '<ul class="dk-student-summary-list">';
            html += '<li><span>First Name:</span><span>' + (payee.given_name||'') + '</span></li>';
            html += '<li><span>Last Name:</span><span>' + (payee.last_name||'') + '</span></li>';
            html += '<li><span>Email:</span><span>' + (payee.email||'') + '</span></li>';
            html += '<li><span>Mobile:</span><span>' + (payee.mobile||'') + '</span></li>';
            html += '</ul>';
        } else {
            html += '<p>No payee details saved.</p>';
        }
        html += '</div>';

        // Students summary
        html += '<div class="dk-summary-section">';
        html += '<h3>Student Details</h3>';
        html += '<div class="dk-title-line"></div>';
        if (state.students && state.students.length) {
            state.students.forEach(function(student, idx) {
                const num = idx + 1;
                const originalFee = COURSE_COST_RAW;
                const revised = (typeof student.revised_price !== 'undefined' && student.revised_price !== null) ? parseFloat(student.revised_price) : null;
                const finalFee = revised !== null ? revised : originalFee;
                const discountAmount = revised !== null ? Math.max(0, originalFee - revised) : 0;
                
                // Check if student is enrolled - if yes, show locked message instead of edit link
                const enrolled = isStudentEnrolled(idx);

                html += '<div class="dk-summary-student-item">';
                if (enrolled) {
                    html += '<div class="dk-student-details-row"><h4>Student ' + num + '</h4><span style="color:#999;font-style:italic;">(Details Locked - Enrolled)</span></div>';
                } else {
                    html += '<div class="dk-student-details-row"><h4>Student ' + num + '</h4><a href="#" class="dk-edit-student-link" data-index="' + idx + '">&lt;&lt; Edit Student Details</a></div>';
                }
                html += '<ul class="dk-student-summary-list">';
                html += '<li><span>First Name:</span><span>' + (student.given_name||'') + '</span></li>';
                html += '<li><span>Last Name:</span><span>' + (student.last_name||'') + '</span></li>';
                html += '<li><span>Email:</span><span>' + (student.email||'') + '</span></li>';
                html += '<li><span>Mobile:</span><span>' + (student.mobile||'') + '</span></li>';
                if (discountAmount > 0) {
                    html += '<li class="dk-student-fee"><span>Original Fee:</span><span>$' + originalFee.toFixed(2) + '</span></li>';
                    html += '<li class="dk-student-discount"><span>Discount:</span><span>-$' + discountAmount.toFixed(2) + '</span></li>';
                    html += '<li class="dk-student-final-fee"><span>Final Fee:</span><span>$' + finalFee.toFixed(2) + '</span></li>';
                } else {
                    html += '<li class="dk-student-fee"><span>Fee:</span><span>$' + finalFee.toFixed(2) + '</span></li>';
                }
                html += '</ul>';
                html += '</div>';
            });
        } else {
            html += '<p>No students added yet.</p>';
        }
        html += '</div>';

        // Totals and actions
        // Totals: original total, discount total, final total
        let originalTotal = 0;
        let finalTotal = 0;
        if (state.students && state.students.length) {
            state.students.forEach(function(s){
                originalTotal += COURSE_COST_RAW;
                finalTotal += (typeof s.revised_price !== 'undefined' && s.revised_price !== null) ? parseFloat(s.revised_price) : COURSE_COST_RAW;
            });
        }
        const discountTotal = Math.max(0, originalTotal - finalTotal);
        if (discountTotal > 0) {
            html += '<div class="dk-totals-row">';
            html += '<h4>Original Total: $' + originalTotal.toFixed(2) + '</h4>';
            html += '<h4>Discount Total: -$' + discountTotal.toFixed(2) + '</h4>';
            html += '<h3 class="dk-summary-total">Final Total: $' + finalTotal.toFixed(2) + '</h3>';
            html += '</div>';
        } else {
            html += '<h3 class="dk-summary-total">Total Fee: $' + finalTotal.toFixed(2) + '</h3>';
        }

        // Promo code input (lock and reflect applied state)
        const appliedPromo = (state.promo && state.promo.code) ? state.promo.code : '';
        const promoLocked = appliedPromo ? true : false;
        html += '<div class="dk-promo-row" style="margin-top:12px;">';
        html += '<label for="dk-promo-code" style="margin-right:8px;">Promo Code:</label>';
        html += '<input type="text" id="dk-promo-code" name="promo_code" style="width:160px;margin-right:8px;" ' + (promoLocked ? 'disabled' : '') + ' value="' + (appliedPromo) + '" />';
        html += '<button id="dk-apply-promo-btn" class="dk-btn dk-btn-outline dk-btn-30">' + (promoLocked ? 'Clear' : 'Apply') + '</button>';
        html += '</div>';
        // Promo status - persist and render from state.promo_status so it survives re-renders
        const promoStatus = (state.promo_status && typeof state.promo_status === 'object') ? state.promo_status : {};
        const promoStatusText = promoStatus.text || '';
        const promoStatusColor = promoStatus.color || '#333';
        html += '<div id="dk-promo-status" class="dk-promo-status" style="margin-top:8px;color:' + promoStatusColor + ';display:block;">' + promoStatusText + '</div>';

        // Pay button placeholder
        html += '<div class="dk-button-group dk-nav-buttons" style="margin-top:20px;">';
        html += '<button id="dk-back-to-details-btn" class="dk-btn dk-btn-outline dk-btn-30"><< Go Back</button>';
        html += '<button id="dk-pay-now-btn" class="dk-btn dk-btn-primary dk-btn-70">Pay Now</button>';
        html += '</div>';

        $step2.append(html);
        
        // Update header with discount info
        updateCourseHeaderCost();
        
        // Add input listener to promo code field to manage Pay Now button state
        // Disable Pay Now if there's unapplied text in the promo box
        $('#dk-promo-code').on('input', function(){
            const currentInput = $(this).val().trim();
            const appliedPromo = (state.promo && state.promo.code) ? state.promo.code : '';
            const $payNowBtn = $('#dk-pay-now-btn');
            const $promoStatus = $('#dk-promo-status');
            
            // Disable Pay Now if:
            // - Input is not empty AND
            // - Input doesn't match the currently applied promo
            if (currentInput && currentInput !== appliedPromo) {
                $payNowBtn.prop('disabled', true).css('opacity', '0.6').attr('title', 'Please click Apply to validate promo code first');
                $promoStatus.text('Apply your promo code before clicking Pay Now').css('color', '#ff6600');
            } else {
                $payNowBtn.prop('disabled', false).css('opacity', '1').attr('title', '');
                $promoStatus.text('').css('color', '#333');
            }
        });
               

        // Attach handlers - check if back button should be disabled
        const shouldDisableBack = hasAnyEnrollments() || isPayeeLocked();
        const $backBtn = $('#dk-back-to-details-btn');
        $backBtn.on('click', function(){ 
            if (shouldDisableBack) {
                alert('Cannot go back - enrollments have been created or invoice exists. Student and payee details are locked. Please contact support if you need to make changes.');
                return;
            }
            goToStep(1); 
        });
        
        // Visually indicate if back button is locked
        if (shouldDisableBack) {
            $backBtn.css('opacity', '0.5').css('cursor', 'not-allowed').attr('title', 'Cannot edit details after enrollment or invoice creation');
        }

        // Pay Now button: ensure contacts exist for payee and students, then proceed
        $('#dk-pay-now-btn').off('click').on('click', function(){
            const $btn = $(this);
            $btn.prop('disabled', true);
            
            // Show modal with progress feedback
            showProcessModal('Processing contact details for payee and students...');

            const currentState = loadState();

            const syncOne = function(person, idx, containerKey) {
                return $.ajax({
                    url: DKEnrolmentData.ajax_url,
                    type: 'POST',
                    data: {
                        action: 'dk_sync_contact',
                        given_name: person.given_name || person.givenName || '',
                        last_name: person.last_name || person.lastName || person.surname || '',
                        email: person.email || person.emailAddress || '',
                        mobile: person.mobile || person.mobilephone || ''
                    }
                }).done(function(r){
                    if (r && r.success && r.data && r.data.contactID) {
                        if (containerKey === 'payee') {
                            currentState.payee = currentState.payee || {};
                            currentState.payee.ax_contact_id = r.data.contactID;
                        } else if (containerKey === 'students') {
                            currentState.students = currentState.students || [];
                            currentState.students[idx] = currentState.students[idx] || {};
                            currentState.students[idx].ax_contact_id = r.data.contactID;
                        }
                    } else {
                        console.warn('Contact sync returned no-success for', containerKey, idx, r);
                    }
                }).fail(function(xhr){
                    console.error('Contact sync failed for', containerKey, idx, xhr && xhr.responseText);
                });
            };

            // SEQUENTIAL: First sync payee if needed, THEN sync students
            let payeeSync = $.Deferred().resolve();
            if (currentState.payee && !(currentState.payee.ax_contact_id || currentState.payee.ax_contact)) {
                payeeSync = syncOne(currentState.payee, 0, 'payee');
            }

            // Check if payee sync succeeded before proceeding
            payeeSync.done(function(){
                // Verify payee has a valid contact ID before proceeding
                if (currentState.payee && !(currentState.payee.ax_contact_id || currentState.payee.ax_contact)) {
                    // Payee sync completed but didn't set a contact ID - treat as failure
                    closeProcessModal();
                    showErrorModal('An error occurred with your payee details. Please check them and try again.', function(){
                        $btn.prop('disabled', false);
                    });
                    return;
                }
                
                // Payee sync successful (or not needed), proceed with students
                const studentOps = [];
                
                // Now sync students, checking if each is the same person as the payee
                if (currentState.students && currentState.students.length) {
                    currentState.students.forEach(function(s, i){
                        if (!(s.ax_contact_id || s.ax_contact)) {
                            // If this student is the same person as the payee, copy the payee's contact ID
                            if (currentState.payee && isSamePerson(s, currentState.payee)) {
                                const payeeContactID = currentState.payee.ax_contact_id || currentState.payee.ax_contact;
                                if (payeeContactID) {
                                    currentState.students[i].ax_contact_id = payeeContactID;
                                    console.debug('Student', i, 'is same person as payee, copied contact ID:', payeeContactID);
                                } else {
                                    console.warn('Student', i, 'is same person as payee but payee sync failed - will sync student independently');
                                    studentOps.push(syncOne(s, i, 'students'));
                                }
                            } else {
                                // Different person, sync independently
                                studentOps.push(syncOne(s, i, 'students'));
                            }
                        }
                    });
                }

                // Wait for all student syncs to complete
                $.when.apply($, studentOps.length ? studentOps : [$.Deferred().resolve()]).always(function(){
                // Persist any updated contact ids
                sessionStorage.setItem(STORAGE_KEY, JSON.stringify(currentState));
                state = currentState;
                saveState();
                $btn.prop('disabled', false);
                
                updateProcessModal('Contacts ensured. Creating tentative enrollments...');
                
                // Proceed with enrolment flow for one-or-more students
                console.debug('Pay Now: contact sync ops complete. state:', state);
                if (state.students && state.students.length >= 1) {
                    console.debug('Pay Now: students present count', state.students.length);
                    const students = state.students;
                    const payeeContact = state.payee ? (state.payee.ax_contact_id || state.payee.ax_contact) : null;

                    // Prepare first student enrollment params (tentative)
                    const first = students[0];
                    const firstContact = first.ax_contact_id || first.ax_contact || 0;
                    
                    console.debug('Pay Now: first student data', first);
                    console.debug('Pay Now: firstContact', firstContact, 'payeeContact', payeeContact);

                    if (!firstContact) {
                        closeProcessModal();
                        showErrorModal('First student contact is missing. Cannot proceed with enrollment.', function(){
                            $btn.prop('disabled', false);
                        });
                        return;
                    }
                    
                    // Check if first student is already enrolled - if yes, use existing enrollment
                    const firstAlreadyEnrolled = (first.enrollment_status && first.enrollment_status !== 'no');
                    
                    if (firstAlreadyEnrolled) {
                        // First student already enrolled, skip enrollment and use existing invoice
                        console.debug('First student already enrolled with status:', first.enrollment_status);
                        // Check if invoiceID exists (can be 0 for 100% discounts)
                        if (typeof state.invoiceID === 'undefined' || state.invoiceID === null) {
                            closeProcessModal();
                            showErrorModal('First student is enrolled but invoice ID is missing. Cannot proceed.', function(){
                                $btn.prop('disabled', false);
                            });
                            return;
                        }
                        
                        // Skip to additional students enrollment
                        proceedWithAdditionalStudents();
                    } else {
                        // First student not yet enrolled - enroll now
                        const firstParams = [];
                        firstParams.push('instanceID=' + encodeURIComponent(INSTANCE_ID));
                        firstParams.push('type=w');
                        firstParams.push('contactID=' + encodeURIComponent(firstContact));
                        firstParams.push('tentative=1');
                        firstParams.push('suppressNotifications=1');
                        firstParams.push('blockAdminNotification=true');
                        // Lock invoice only if this is the only student, otherwise keep open for more students
                        if (students.length === 1) {
                            firstParams.push('lockInvoiceItems=1');
                        } else {
                            firstParams.push('lockInvoiceItems=0');
                        }
                        if (payeeContact && payeeContact !== firstContact) firstParams.push('payerID=' + encodeURIComponent(payeeContact));
                        if (typeof first.revised_price !== 'undefined' && first.revised_price !== null) firstParams.push('cost=' + encodeURIComponent(parseFloat(first.revised_price).toFixed(2)));
                        if (first.discount_id) firstParams.push('discountIDList=' + encodeURIComponent(first.discount_id));

                        updateProcessModal('Enrolling first student tentatively and creating invoice...');
                        const firstParamsObj = {};
                        firstParams.forEach(function(p){ const parts = p.split('='); firstParamsObj[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1] || ''); });
                        console.debug('Pay Now: firstParamsObj (tentative)', firstParamsObj);
                        
                        proxyEnrol(firstParamsObj).done(function(res){
                            console.debug('proxyEnrol response for first student', res);
                            const payload = unwrap(res);
                            // Check for valid response - INVOICEID can be 0 for 100% discounts, so check for LEARNERID instead
                            if (!(payload && payload.LEARNERID)) {
                                closeProcessModal();
                                showErrorModal('Failed to create enrollment for first student. Please try again.', function(){
                                    $btn.prop('disabled', false);
                                });
                                console.error('Enrol API returned unexpected result for first student', payload);
                                return;
                            }
                            
                            // Save enrollment status and learner ID for first student
                            // INVOICEID may be 0 for 100% discounts - this is expected
                            const invoiceID = payload.INVOICEID || 0;
                            const learnerID = payload.LEARNERID || null;
                            state.invoiceID = invoiceID;
                            state.students[0].enrollment_status = 'tentative';
                            state.students[0].learner_id = learnerID;
                            state.students[0].enrolled_at = Date.now();
                            state.current_flow = 'step2-payment';
                            saveState();
                            console.debug('First student enrolled: status=tentative, learnerID=', learnerID, 'invoiceID=', invoiceID);

                            proceedWithAdditionalStudents();
                        }).fail(function(xhr){
                            closeProcessModal();
                            showErrorModal('Failed to enroll first student: ' + (xhr.responseText || 'Unknown error'), function(){
                                $btn.prop('disabled', false);
                            });
                            console.error('Enrol API failed for first student', xhr);
                        });
                    }
                    
                    function proceedWithAdditionalStudents() {
                        const invoiceID = state.invoiceID;
                        
                        // Enrol remaining students (if any) by adding them to the invoice - TENTATIVE
                        const enrolOps = [];
                        const enrolFailures = [];
                        
                        if (students.length > 1) {
                            updateProcessModal('Enrolling ' + (students.length - 1) + ' additional student(s) tentatively...');
                        }
                        
                        // First pass: determine which students need enrollment
                        const studentsToEnrol = [];
                        for (let i = 1; i < students.length; i++) {
                            const s = students[i];
                            const contactID = s.ax_contact_id || s.ax_contact || 0;
                            
                            if (!contactID) { 
                                console.warn('Skipping student without contactID at index', i);
                                enrolFailures.push('Student ' + (i + 1) + ' is missing contact ID');
                                continue; 
                            }
                            
                            // Check if this student is already enrolled
                            const alreadyEnrolled = (s.enrollment_status && s.enrollment_status !== 'no');
                            if (alreadyEnrolled) {
                                console.debug('Student', i, 'already enrolled with status:', s.enrollment_status);
                                continue; // Skip this student, already enrolled
                            }
                            
                            studentsToEnrol.push(i);
                        }
                        
                        // Second pass: enrol the students that need it SEQUENTIALLY (not in parallel)
                        // This ensures lockInvoiceItems on the last student happens after all others are added
                        let enrolChain = $.Deferred().resolve();
                        
                        for (let idx = 0; idx < studentsToEnrol.length; idx++) {
                            const i = studentsToEnrol[idx];
                            const s = students[i];
                            const contactID = s.ax_contact_id || s.ax_contact || 0;
                            
                            const params = [];
                            params.push('instanceID=' + encodeURIComponent(INSTANCE_ID));
                            params.push('type=w');
                            params.push('contactID=' + encodeURIComponent(contactID));
                            params.push('invoiceID=' + encodeURIComponent(invoiceID));
                            params.push('tentative=1');
                            params.push('suppressNotifications=1');
                            params.push('blockAdminNotification=true');
                            // Lock invoice only on the LAST student that actually needs enrollment
                            if (idx === studentsToEnrol.length - 1) {
                                params.push('lockInvoiceItems=1');
                            } else {
                                params.push('lockInvoiceItems=0');
                            }
                            if (payeeContact && payeeContact !== contactID) params.push('payerID=' + encodeURIComponent(payeeContact));
                            if (typeof s.revised_price !== 'undefined' && s.revised_price !== null) params.push('cost=' + encodeURIComponent(parseFloat(s.revised_price).toFixed(2)));
                            if (s.discount_id) params.push('discountIDList=' + encodeURIComponent(s.discount_id));
                            const paramsObj = {};
                            params.forEach(function(p){ const parts = p.split('='); paramsObj[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1] || ''); });
                            
                            // Chain this enrollment to happen AFTER the previous one completes
                            enrolChain = enrolChain.then(function() {
                                console.debug('Pay Now: enrolling additional student (tentative)', i, paramsObj);
                                return proxyEnrol(paramsObj).done(function(r2){
                                    console.debug('proxyEnrol response for additional student', i, r2);
                                    const p2 = unwrap(r2);
                                    // Check for valid response - INVOICEID can be 0 for 100% discounts, so check for LEARNERID
                                    if (!(p2 && p2.LEARNERID)) {
                                        console.warn('Enrol for additional student returned unexpected result', i, p2);
                                        enrolFailures.push('Student ' + (i + 1) + ' enrollment returned invalid response');
                                    } else {
                                        // Save enrollment status and learner ID
                                        const learnerID = p2.LEARNERID || null;
                                        state.students[i].enrollment_status = 'tentative';
                                        state.students[i].learner_id = learnerID;
                                        state.students[i].enrolled_at = Date.now();
                                        saveState();
                                        console.debug('Student', i, 'enrolled: status=tentative, learnerID=', learnerID);
                                    }
                                }).fail(function(xhr){ 
                                    console.error('Enrol API failed for additional student', i, xhr && xhr.responseText);
                                    enrolFailures.push('Student ' + (i + 1) + ' enrollment failed: ' + (xhr.responseText || 'Unknown error'));
                                });
                            });
                        }
                        
                        // After all sequential enrollments complete, validate all are enrolled
                        enrolChain.always(function(){
                            console.debug('Pay Now: all tentative enrol ops complete');
                            
                            // Validate ALL students have enrollment_status = 'tentative' or higher
                            const notEnrolled = [];
                            for (let i = 0; i < state.students.length; i++) {
                                const status = state.students[i].enrollment_status || 'no';
                                if (status === 'no') {
                                    notEnrolled.push('Student ' + (i + 1));
                                }
                            }
                            
                            if (notEnrolled.length > 0 || enrolFailures.length > 0) {
                                closeProcessModal();
                                const errorMsg = 'Some students failed to enroll:\n' + 
                                    (notEnrolled.length > 0 ? notEnrolled.join(', ') + ' not enrolled.\n' : '') +
                                    (enrolFailures.length > 0 ? enrolFailures.join('\n') : '');
                                showErrorModal(errorMsg, function(){
                                    $btn.prop('disabled', false);
                                });
                                return;
                            }
                            
                            // All students enrolled - check if invoice total is $0 (100% discount)
                            const invoiceTotal = calculateInvoiceTotal();
                            console.debug('Invoice total calculated:', invoiceTotal);
                            
                            if (invoiceTotal <= 0) {
                                // 100% discount - bypass payment and finalize immediately
                                updateProcessModal('Enrollment is fully discounted. Finalizing booking...');
                                finalizeEnrollmentsWithoutPayment();
                            } else {
                                // Normal flow - proceed to payment
                                updateProcessModal('Tentative enrollments complete. Preparing payment form...');
                                fetchInvoiceAndPaymentForm();
                            }
                        });
                    }
                    
                    // Helper: Calculate total invoice amount based on student prices
                    function calculateInvoiceTotal() {
                        let total = 0;
                        if (state.students && state.students.length) {
                            state.students.forEach(function(s){
                                const price = (typeof s.revised_price !== 'undefined' && s.revised_price !== null) 
                                    ? parseFloat(s.revised_price) 
                                    : COURSE_COST_RAW;
                                total += price;
                            });
                        }
                        return total;
                    }
                    
                    // Finalize enrollments without payment (for 100% discounts)
                    function finalizeEnrollmentsWithoutPayment() {
                        const students = state.students || [];
                        const payeeContact = state.payee ? (state.payee.ax_contact_id || state.payee.ax_contact) : null;
                        const invoiceID = (typeof state.invoiceID !== 'undefined' && state.invoiceID !== null) ? state.invoiceID : '';
                        
                        if (!students.length || invoiceID === '') {
                            console.error('Cannot finalize: missing students or invoiceID', { students, invoiceID });
                            closeProcessModal();
                            showErrorModal('Unable to finalize enrollment. Missing required data.', function(){
                                $btn.prop('disabled', false);
                            });
                            return;
                        }
                        
                        // Build list of students to finalize
                        const studentsToFinalize = [];
                        students.forEach(function(student, idx) {
                            const contactID = student.ax_contact_id || student.ax_contact || 0;
                            if (!contactID) {
                                console.warn('Skipping finalization for student without contactID at index', idx);
                                return;
                            }
                            
                            const params = [];
                            params.push('instanceID=' + encodeURIComponent(INSTANCE_ID));
                            params.push('type=w');
                            params.push('contactID=' + encodeURIComponent(contactID));
                            params.push('invoiceID=' + encodeURIComponent(invoiceID));
                            params.push('tentative=0');
                            params.push('suppressNotifications=0');
                            params.push('blockAdminNotification=true');
                            if (payeeContact && payeeContact !== contactID) params.push('payerID=' + encodeURIComponent(payeeContact));
                            if (typeof student.revised_price !== 'undefined' && student.revised_price !== null) params.push('cost=' + encodeURIComponent(parseFloat(student.revised_price).toFixed(2)));
                            if (student.discount_id) params.push('discountIDList=' + encodeURIComponent(student.discount_id));
                            
                            const paramsObj = {};
                            params.forEach(function(p){ const parts = p.split('='); paramsObj[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1] || ''); });
                            console.debug('Preparing finalization (no payment) for student', idx, paramsObj);
                            
                            studentsToFinalize.push({ idx: idx, paramsObj: paramsObj });
                        });
                        
                        // Finalize enrollments sequentially
                        let finalizeChain = $.Deferred().resolve().promise();
                        studentsToFinalize.forEach(function(studentData) {
                            finalizeChain = finalizeChain.then(function() {
                                console.log('Finalizing enrollment (no payment) for student', studentData.idx);
                                return proxyEnrol(studentData.paramsObj).fail(function(xhr){
                                    console.error('Failed to finalize enrollment for student', studentData.idx, xhr && xhr.responseText);
                                });
                            });
                        });
                        
                        finalizeChain.always(function(){
                            console.log('All enrollments finalized (no payment required)');
                            closeProcessModal();
                            
                            // Mark as completed and go to Step 3
                            state.students.forEach(function(s, i){
                                state.students[i].enrollment_status = 'confirmed';
                            });
                            state.current_flow = 'step3-complete';
                            saveState();
                            
                            goToStep(3);
                        });
                    }
                    
                    function fetchInvoiceAndPaymentForm() {
                        const invoiceID = state.invoiceID;
                        console.debug('Pay Now: fetching invoice', invoiceID);
                            // fetch invoice to get INVGUID
                            proxyGetInvoice(invoiceID).done(function(inv){
                                console.debug('proxyGetInvoice response', inv);
                                const invPayload = unwrap(inv);
                                if (invPayload && invPayload.INVGUID) {
                                    state.invoiceGUID = invPayload.INVGUID;
                                    saveState();
                                    // Request payment form via server proxy
                                    const currentUrl = window.location.href;
                                    proxyGetPaymentForm(invPayload.INVGUID, invPayload.INVGUID, currentUrl, currentUrl).done(function(formRes){
                                        console.debug('proxyGetPaymentForm response', formRes);
                                        const formPayload = unwrap(formRes);
                                        if (formPayload && formPayload.SUCCESS && formPayload.DATA) {
                                            // Auto-redirect to Stripe payment form
                                            updateProcessModal('Redirecting to secure payment...');
                                            
                                            const action = formPayload.DATA.ACTION || '';
                                            const method = (formPayload.DATA.FORMMETHOD || 'POST').toUpperCase();
                                            const innerHtml = formPayload.DATA.HTML || '';
                                            
                                            // Create a hidden container for the form
                                            const $container = $('<div id="dk-payment-form-container" style="display:none;"></div>');
                                            const $form = $('<form id="dk-external-payment-form"></form>');
                                            $form.attr('action', action).attr('method', method).html(innerHtml);
                                            
                                            // Add the required submit button that Axcelerate's script expects
                                            if ($form.find('input.ax-ecommerce-pay-btn[type="submit"]').length === 0) {
                                                const $submit = $('<input type="submit" class="ax-ecommerce-pay-btn" value="Pay Now" />');
                                                $form.append($submit);
                                            }
                                            
                                            $container.append($form);
                                            $('body').append($container);
                                            
                                            // Close modal before redirect
                                            setTimeout(function(){
                                                closeProcessModal();
                                            }, 1000);
                                            
                                            // Auto-submit the form after Axcelerate's script has initialized
                                            setTimeout(function(){
                                                // Check if AX_CHECKOUT is available (from the included script)
                                                if (typeof AX_CHECKOUT !== 'undefined' && AX_CHECKOUT.submitPaymentForm) {
                                                    // Use the Axcelerate function directly
                                                    AX_CHECKOUT.submitPaymentForm($form[0]);
                                                } else {
                                                    // Fallback: manually submit with method=get as the script would do
                                                    $form[0].method = 'get';
                                                    $form[0].submit();
                                                }
                                            }, 1500); // Wait 1.5s for modal close + script initialization
                                        } else {
                                            updateProcessModal('Error: Failed to obtain payment form. See console.');
                                            enableProcessModalClose();
                                            console.error('Payment form error', formPayload);
                                        }
                                    }).fail(function(xhr){ 
                                        console.error('Payment form request failed', xhr && xhr.responseText); 
                                        updateProcessModal('Error: Failed to obtain payment form.');
                                        enableProcessModalClose();
                                    });
                                } else {
                                    updateProcessModal('Error: Failed to retrieve invoice GUID.');
                                    enableProcessModalClose();
                                    console.error('Invoice lookup returned unexpected result', invPayload);
                                }
                            }).fail(function(xhr){ 
                                closeProcessModal();
                                showErrorModal('Failed to fetch invoice: ' + (xhr.responseText || 'Unknown error'), function(){
                                    $btn.prop('disabled', false);
                                });
                                console.error('Invoice fetch failed', xhr && xhr.responseText);
                            });
                    }  // closes fetchInvoiceAndPaymentForm function
                }
                });  // closes $.when.apply for student syncs
            }).fail(function(){
                // Payee sync failed (AJAX error or other promise rejection)
                closeProcessModal();
                showErrorModal('An error occurred with your payee details. Please check them and try again.', function(){
                    $btn.prop('disabled', false);
                });
            });  // closes payeeSync.done and payeeSync.fail
        });  // closes Pay Now button click handler
        // If a promo code is already applied in state, but some students lack discount data,
        // automatically re-check discounts so the UI shows accurate fees after coming back from step 1.
        if (state.promo && state.promo.code && !promoResyncing) {
            // find student indices that are missing discount info
            const missing = [];
            if (state.students && state.students.length) {
                state.students.forEach(function(s, i){
                    const hasDiscount = (typeof s.discount_id !== 'undefined' && s.discount_id !== null && s.discount_id > 0) || (typeof s.revised_price !== 'undefined' && s.revised_price !== null);
                    if (!hasDiscount) missing.push(i);
                });
            }

            if (missing.length > 0) {
                promoResyncing = true;
                const promoCode = state.promo.code;
                state.promo_status = { text: 'Re-applying promotion to students...', color: '#333' };
                saveState();
                $('#dk-promo-status').css('color', state.promo_status.color).text(state.promo_status.text);
                $('#dk-apply-promo-btn').prop('disabled', true);

                // First: ensure contacts exist for missing students (create/search)
                const contactOps = [];
                missing.forEach(function(idx){
                    const student = state.students[idx];
                    const contactID = student.ax_contact_id || student.ax_contact || '';
                    if (!contactID) {
                        // Check if this student is the same person as the payee
                        if (state.payee && isSamePerson(student, state.payee)) {
                            const payeeContactID = state.payee.ax_contact_id || state.payee.ax_contact;
                            if (payeeContactID) {
                                state.students[idx].ax_contact_id = payeeContactID;
                                console.debug('Promo re-sync: Student', idx, 'is same person as payee, copied contact ID:', payeeContactID);
                            } else {
                                // Payee doesn't have contact ID either, so sync this student
                                contactOps.push($.ajax({
                                    url: DKEnrolmentData.ajax_url,
                                    type: 'POST',
                                    data: {
                                        action: 'dk_sync_contact',
                                        given_name: student.given_name || student.givenName || '',
                                        last_name: student.last_name || student.lastName || student.surname || '',
                                        email: student.email || student.emailAddress || '',
                                        mobile: student.mobile || student.mobilephone || ''
                                    }
                                }).done(function(r){
                                    if (r && r.success && r.data && r.data.contactID) {
                                        state.students[idx].ax_contact_id = r.data.contactID;
                                        // Also update payee since they're the same person
                                        if (state.payee) state.payee.ax_contact_id = r.data.contactID;
                                    } else {
                                        console.warn('Contact sync returned no-success for student', idx, r);
                                    }
                                }).fail(function(xhr){ console.error('Contact sync failed for student', idx, xhr && xhr.responseText); }));
                            }
                        } else {
                            // Different person, sync normally
                            contactOps.push($.ajax({
                                url: DKEnrolmentData.ajax_url,
                                type: 'POST',
                                data: {
                                    action: 'dk_sync_contact',
                                    given_name: student.given_name || student.givenName || '',
                                    last_name: student.last_name || student.lastName || student.surname || '',
                                    email: student.email || student.emailAddress || '',
                                    mobile: student.mobile || student.mobilephone || ''
                                }
                            }).done(function(r){
                                if (r && r.success && r.data && r.data.contactID) {
                                    state.students[idx].ax_contact_id = r.data.contactID;
                                } else {
                                    console.warn('Contact sync returned no-success for student', idx, r);
                                }
                            }).fail(function(xhr){ console.error('Contact sync failed for student', idx, xhr && xhr.responseText); }));
                        }
                    }
                });

                // After contacts are synced (or immediately if none needed), run discount checks
                $.when.apply($, contactOps.length ? contactOps : [$.Deferred().resolve()]).then(function(){
                    const discountRequests = [];
                    missing.forEach(function(idx){
                        const student = state.students[idx];
                        const contactID = student.ax_contact_id || student.ax_contact || 0;
                        if (!contactID) {
                            console.warn('Skipping discount recheck for student', idx, 'still missing contactID');
                            return;
                        }
                        discountRequests.push($.ajax({
                            url: DKEnrolmentData.ajax_url,
                            type: 'POST',
                            data: {
                                action: 'dk_check_discount',
                                contactID: contactID,
                                instanceID: INSTANCE_ID,
                                originalPrice: COURSE_COST_RAW,
                                promoCode: promoCode
                            }
                        }).done(function(r){
                            if (r && r.success && r.data) {
                                const revised = parseFloat(r.data.revisedPrice);
                                const discount = r.data.discount || {};
                                state.students[idx].revised_price = revised;
                                if (discount.DISCOUNTID && discount.DISCOUNTID > 0) state.students[idx].discount_id = discount.DISCOUNTID;
                            } else {
                                console.warn('Discount recheck returned no-success for student', idx, r);
                            }
                        }).fail(function(xhr){ console.error('Discount recheck AJAX failed for student', idx, xhr && xhr.responseText); }));
                    });

                    // Wait for all discount checks to complete
                    return $.when.apply($, discountRequests.length ? discountRequests : [$.Deferred().resolve()]);
                }, function(){
                    // contact sync failed for one or more students
                    state.promo_status = { text: 'Failed to sync one or more student contacts. See console.', color: 'red' };
                    saveState();
                    promoResyncing = false;
                    $('#dk-apply-promo-btn').prop('disabled', false);
                    renderStep2();
                    // return a rejected deferred to stop further processing
                    const d = $.Deferred(); d.reject(); return d.promise();
                }).always(function(){
                    // After discount rechecks finished (or if none needed)
                    saveState();
                    // recompute applied count
                    let appliedCount = 0;
                    if (state.students && state.students.length) {
                        state.students.forEach(function(s){ if (s.discount_id && s.discount_id > 0) appliedCount++; });
                    }
                    if (appliedCount > 0) {
                        state.promo_status = { text: 'Promotion applied: ' + appliedCount + ' student(s) received a discount.', color: 'green' };
                    } else {
                        state.promo_status = { text: 'Code does not exist, is invalid or has expired.', color: 'red' };
                    }
                    saveState();
                    promoResyncing = false;
                    $('#dk-apply-promo-btn').prop('disabled', false);
                    // re-render to show updated fees/status
                    renderStep2();
                });
            }
        }

        // Apply / Clear promotion code button handler
        $('#dk-apply-promo-btn').off('click').on('click', function(){
            // Disable Pay Now button immediately while processing
            $('#dk-pay-now-btn').prop('disabled', true).css('opacity', '0.6');
            
            // If promo already applied, this button clears it
                if (state.promo && state.promo.code) {
                    // Clear discounts and promo
                    if (state.students && state.students.length) {
                        state.students.forEach(function(s){ delete s.revised_price; delete s.discount_id; });
                    }
                    delete state.promo;
                    // persist a transient promo status so renderStep2 can show the cleared message
                    state.promo_status = { text: 'Promotion cleared.', color: '#333' };
                    saveState();
                    // Re-enable Pay Now before re-render
                    $('#dk-pay-now-btn').prop('disabled', false).css('opacity', '1');
                    renderStep2();
                    return;
                }

            const promo = $('#dk-promo-code').val().trim();
            if (!promo) { alert('Please enter a promo code.'); return; }

            // Ensure contacts exist (create/search) before requesting discounts
            const currentState = loadState();
            const ensureContacts = function() {
                const syncOne = function(person, idx, containerKey) {
                    return $.ajax({
                        url: DKEnrolmentData.ajax_url,
                        type: 'POST',
                        data: {
                            action: 'dk_sync_contact',
                            given_name: person.given_name || person.givenName || '',
                            last_name: person.last_name || person.lastName || person.surname || '',
                            email: person.email || person.emailAddress || '',
                            mobile: person.mobile || person.mobilephone || ''
                        }
                    }).done(function(r){
                        if (r && r.success && r.data && r.data.contactID) {
                            if (containerKey === 'payee') {
                                currentState.payee.ax_contact_id = r.data.contactID;
                            } else if (containerKey === 'students') {
                                currentState.students[idx].ax_contact_id = r.data.contactID;
                            }
                        }
                    });
                };
                
                // SEQUENTIAL: First sync payee if needed, THEN sync students
                let payeeSync = $.Deferred().resolve();
                if (currentState.payee && (!currentState.payee.ax_contact_id && !currentState.payee.ax_contact)) {
                    payeeSync = syncOne(currentState.payee, 0, 'payee');
                }
                
                // After payee sync completes, sync students
                return payeeSync.then(function(){
                    const studentOps = [];
                    
                    if (currentState.students && currentState.students.length) {
                        currentState.students.forEach(function(s, i){
                            if (!s.ax_contact_id && !s.ax_contact) {
                                // If this student is the same person as the payee, copy payee's contact ID
                                if (currentState.payee && isSamePerson(s, currentState.payee)) {
                                    const payeeContactID = currentState.payee.ax_contact_id || currentState.payee.ax_contact;
                                    if (payeeContactID) {
                                        currentState.students[i].ax_contact_id = payeeContactID;
                                        console.debug('Promo: Student', i, 'is same person as payee, copied contact ID:', payeeContactID);
                                    } else {
                                        console.warn('Promo: Student', i, 'is same person as payee but payee sync failed - will sync independently');
                                        studentOps.push(syncOne(s, i, 'students'));
                                    }
                                } else {
                                    studentOps.push(syncOne(s, i, 'students'));
                                }
                            }
                        });
                    }
                    
                    return $.when.apply($, studentOps.length ? studentOps : [$.Deferred().resolve()]);
                }).then(function(){ 
                    return { success:true, data:{ state: currentState } }; 
                }, function(){ 
                    return $.Deferred().resolve({ success:false, data:{ message: 'One or more contact syncs failed', state: currentState } }); 
                });
            };

            // show initial status and disable button
            $('#dk-promo-status').text('Checking promo code and ensuring contacts...');
            $('#dk-apply-promo-btn').prop('disabled', true);

            ensureContacts().done(function(res){
                    if (res && res.success && res.data && res.data.state) {
                    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(res.data.state));
                    state = res.data.state;
                } else if (res && !res.success) {
                    console.error('Contact sync errors:', res.data && res.data.errors ? res.data.errors : res.data);
                    // persist the error so subsequent renderStep2 won't erase it
                    state.promo_status = { text: 'Contact sync returned errors. See console.', color: '#333' };
                    saveState();
                    $('#dk-promo-status').text('Contact sync returned errors. See console.');
                    $('#dk-apply-promo-btn').prop('disabled', false);
                    // Re-enable Pay Now on error
                    $('#dk-pay-now-btn').prop('disabled', false).css('opacity', '1');
                    return;
                }

                // Now call discount check for each student
                const requests = [];
                $('#dk-promo-status').text('Checking discounts for students...');
                if (state.students && state.students.length) {
                    state.students.forEach(function(student, idx){
                        const contactID = student.ax_contact_id || student.ax_contact || 0;
                        if (!contactID) { console.warn('Skipping student without contactID at index', idx); return; }
                        requests.push($.ajax({
                            url: DKEnrolmentData.ajax_url,
                            type: 'POST',
                            data: {
                                action: 'dk_check_discount',
                                contactID: contactID,
                                instanceID: INSTANCE_ID,
                                originalPrice: COURSE_COST_RAW,
                                promoCode: promo
                            }
                        }).done(function(r){
                            if (r && r.success && r.data) {
                                const revised = parseFloat(r.data.revisedPrice);
                                const discount = r.data.discount || {};
                                state.students[idx].revised_price = revised;
                                if (discount.DISCOUNTID && discount.DISCOUNTID > 0) state.students[idx].discount_id = discount.DISCOUNTID;
                            } else {
                                console.warn('Discount check returned no-success for student', idx, r);
                            }
                        }).fail(function(xhr){ console.error('Discount AJAX failed for student', idx, xhr.responseText); }));
                    });
                }

                $.when.apply($, requests).always(function(){
                    saveState();
                    // Determine if any discounts applied
                    let appliedCount = 0;
                    if (state.students && state.students.length) {
                        state.students.forEach(function(s){ if (s.discount_id && s.discount_id > 0) appliedCount++; });
                    }
                    if (appliedCount > 0) {
                        // persist applied promo code so UI locks
                        state.promo = { code: promo };
                        state.promo_status = { text: 'Promotion applied: ' + appliedCount + ' student(s) received a discount.', color: 'green' };
                        saveState();
                        $('#dk-promo-status').css('color','green').text(state.promo_status.text);
                    } else {
                        state.promo_status = { text: 'Code does not exist, is invalid or has expired.', color: 'red' };
                        saveState();
                        $('#dk-promo-status').css('color','red').text(state.promo_status.text);
                    }
                    $('#dk-apply-promo-btn').prop('disabled', false);
                    // Re-enable Pay Now after processing completes
                    $('#dk-pay-now-btn').prop('disabled', false).css('opacity', '1');
                    renderStep2();
                });

            }).fail(function(xhr){ 
                console.error('Contact sync AJAX error', xhr.responseText); 
                alert('Failed to ensure contacts. See console for details.'); 
                // Re-enable Pay Now on AJAX failure
                $('#dk-pay-now-btn').prop('disabled', false).css('opacity', '1');
                $('#dk-apply-promo-btn').prop('disabled', false);
            });
        });
    }
});