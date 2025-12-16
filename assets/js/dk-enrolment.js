// assets/js/dk-enrolment.js

jQuery(document).ready(function($) {
    const $wrapper = $('#dk-enrolment-wrapper');
    if (!$wrapper.length || typeof DKEnrolmentData === 'undefined') {
        return;
    }

    // --- Core Data and State Management ---
    const STORAGE_KEY = 'dk_enrolment_students';
    const COURSE_COST_RAW = parseFloat($('#dk-step-1').data('instance-cost'));
    const SPACES_AVAIL = parseInt($('#dk-step-1').data('spaces-avail'));
    const INSTANCE_ID = $('#dk-step-1').data('instance-id');
    const COURSE_TYPE = $('#dk-step-1').data('course-type');
    
    let currentStudents = loadStudents(); 
    let activeStep = 1;
    let currentFormIndex = currentStudents.length > 0 ? currentStudents.length - 1 : 0;
    
    // --- 1. Helper Functions ---

    // Load student data from session storage (handles refresh/back navigation)
    function loadStudents() {
        try {
            return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || [];
        } catch (e) {
            console.error("Error loading student data from storage:", e);
            return [];
        }
    }

    // Save student data to session storage
    function saveStudents() {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(currentStudents));
    }
    
    // Validate a single student form
    function validateForm(formData) {
        // Simple check for required fields being non-empty
        if (!formData.given_name || !formData.last_name || !formData.email || !formData.mobile) {
            return false;
        }
        // Check for required agreement checkboxes
        if (!formData.agreement_1 || !formData.agreement_2) {
            return false;
        }
        // Basic email validation
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(formData.email)) {
            return false;
        }
        return true;
    }

    // Displays a dynamic modal/warning popup
    function showConfirmation(message, onYes, onNo) {
        const $modal = $('<div class="dk-modal-overlay"></div>');
        const $content = $(`
            <div class="dk-modal-content">
                <p>${message}</p>
                <div class="dk-button-group">
                    <button class="dk-btn dk-btn-primary dk-confirm-yes">Yes</button>
                    <button class="dk-btn dk-btn-secondary dk-confirm-no">No</button>
                </div>
            </div>
        `);
        
        $content.find('.dk-confirm-yes').on('click', function() { $modal.remove(); onYes(); });
        $content.find('.dk-confirm-no').on('click', function() { $modal.remove(); onNo(); });
        
        $modal.append($content);
        $('body').append($modal);
    }

    // --- 2. Flow and UI Handlers (Step 1) ---

    // Handles locking the current form, saving data, and adding a new form
    function processAndAddStudent(isFinalSave = false) {
        const $currentForm = $(`#dk-student-forms-container form`).eq(currentFormIndex);
        const $formBlock = $currentForm.closest('.dk-student-form-block');
        
        // Serialize form data
        const formDataArray = $currentForm.serializeArray();
        let formData = {};
        formDataArray.forEach(item => {
            if (item.name.startsWith('agreement')) {
                // Handle checkboxes (only present if checked)
                formData[item.name] = true;
            } else {
                formData[item.name] = item.value;
            }
        });

        // Add unchecked agreement fields back as false for consistent state
        if (!formData.agreement_1) formData.agreement_1 = false;
        if (!formData.agreement_2) formData.agreement_2 = false;

        // Validation
        if (!validateForm(formData)) {
            $('#dk-validation-message').text(DKEnrolmentData.messages.validation_error).fadeIn();
            $currentForm.find('input:invalid').first().focus();
            return false;
        }
        $('#dk-validation-message').fadeOut();

        // 1. Save data for current student
        currentStudents[currentFormIndex] = formData;
        
        // Ensure no placeholder blank form data is saved if user hits Save/Yes immediately
        currentStudents = currentStudents.filter(s => s && s.given_name); 

        saveStudents();
        
        // 2. Lock form fields (simulated by disabling inputs)
        $formBlock.attr('data-is-locked', 'true').find('input').prop('disabled', true);
        
        // 3. Add Delete button to the now-locked form (if not the first student)
        if (currentFormIndex > 0 && $formBlock.find('.dk-delete-student-btn').length === 0) {
            $formBlock.find('.dk-form-header').append(`
                <button type="button" class="dk-btn dk-btn-delete dk-delete-student-btn" data-index="${currentFormIndex}">Delete Student</button>
            `);
        }

        if (isFinalSave) {
            // Final save triggers confirmation
            showConfirmation(
                DKEnrolmentData.messages.final_check,
                // YES: Proceed to Payment
                function() { 
                    goToStep(2); 
                },
                // NO: Add new student and continue
                function() { 
                    if (currentStudents.length < SPACES_AVAIL) {
                        currentFormIndex = currentStudents.length; // Next blank index
                        addBlankStudentForm();
                        updateButtonVisibility();
                    } else {
                        alert('Maximum number of students reached!');
                    }
                }
            );
        } else {
            // Add New Student button click
            if (currentStudents.length < SPACES_AVAIL) {
                currentFormIndex = currentStudents.length; // Next blank index
                addBlankStudentForm();
                updateButtonVisibility();
            } else {
                alert('Maximum number of students reached!');
            }
        }
        return true;
    }

    // Renders the blank form block using the PHP template (via AJAX)
    function addBlankStudentForm(data = {}) {
        const indexToRender = currentStudents.length; 
        
        $.ajax({
            url: DKEnrolmentData.ajax_url,
            type: 'POST',
            data: {
                action: 'dk_render_student_form_html',
                index: indexToRender,
                student_data: data,
                is_locked: false,
                show_delete: indexToRender > 0
            },
            success: function(response) {
                if (response.success) {
                    $('#dk-student-forms-container').append(response.data.html);
                    // Scroll to the new form
                    $('html, body').animate({
                        scrollTop: $('#dk-student-forms-container').find('.dk-student-form-block').last().offset().top - 100
                    }, 500);
                }
            }
        });
    }

    // Initial setup after 'Book for myself/someone else' is clicked
    function showStudentForms(isMyself) {
        if (isMyself) {
            $('#dk-form-view-title').text('Book for Myself');
        } else {
             $('#dk-form-view-title').text('Group/Someone Else Booking');
        }
        
        $('#dk-step-1-initial-view').hide();
        $('#dk-step-1-form-view').fadeIn();
        
        if (currentStudents.length === 0) {
            // Start a single blank form
            addBlankStudentForm();
        } else {
            // Re-render existing forms from local storage
            renderAllStudents();
        }
        updateButtonVisibility();
    }
    
    // Renders all forms saved in currentStudents array
    function renderAllStudents() {
        const $container = $('#dk-student-forms-container').empty();
        currentStudents.forEach((data, index) => {
             // Lock all but the last one, if there are multiple
             const isLocked = index < currentStudents.length - 1; 

             // AJAX call to PHP to render form HTML for saved data
            $.ajax({
                url: DKEnrolmentData.ajax_url,
                type: 'POST',
                data: {
                    action: 'dk_render_student_form_html',
                    index: index,
                    student_data: data,
                    is_locked: isLocked, 
                    show_delete: index > 0
                },
                async: false, // Must be synchronous to ensure correct index/order
                success: function(response) {
                    if (response.success) {
                        $container.append(response.data.html);
                    }
                }
            });
        });
        currentFormIndex = currentStudents.length - 1;
        
        // If the last form was saved, we need to add a new blank form
        if (currentStudents.length > 0 && $('#dk-student-forms-container form').last().find('input').prop('disabled')) {
             currentFormIndex = currentStudents.length;
             addBlankStudentForm();
        }
    }

    // Controls the visibility of 'Add New Student' button based on spots left
    function updateButtonVisibility() {
        if (currentStudents.length < SPACES_AVAIL) {
            $('#dk-add-new-student-btn').show();
        } else {
            $('#dk-add-new-student-btn').hide();
        }
    }
    
    // --- 3. Flow and UI Handlers (General Navigation) ---

    // Updates the tab UI when moving steps
    function goToStep(step) {
        if (step > 3 || step < 1) return;
        
        // Deactivate old content and tab
        $(`.dk-step-content`).hide();
        $(`.dk-tab-item`).removeClass('dk-active-tab');

        // Activate new content and tab
        $(`#dk-step-${step}`).show();
        $(`.dk-step-${step}`).addClass('dk-active-tab');
        
        activeStep = step;
        
        if (step === 2) {
            renderPaymentSummary();
            renderPaymentForm();
        }
    }
    
    // Renders the summary section for the Payment tab (Step 2)
    function renderPaymentSummary() {
        let html = '<div class="dk-summary-section">';
        html += '<h3>Booking Summary</h3>';
        
        // Course Details Summary (Pulled from header)
        html += `<div class="dk-summary-course-info">
            <p><strong>Course:</strong> ${$('.dk-course-header h3').text()}</p>
            <p>${$('.dk-course-header p').html()}</p>
        </div>`;
        html += '<hr class="dk-summary-divider">';

        // Student List Summary
        currentStudents.forEach((student, index) => {
            const studentNum = index + 1;
            
            html += `<div class="dk-summary-student-item">
                <div class="dk-student-details-row">
                    <h4>Student ${studentNum}</h4>
                    <a href="#" class="dk-edit-student-link" data-index="${index}">&lt;&lt; Edit Student Details</a>
                </div>
                <ul class="dk-student-summary-list">
                    <li><span>First Name:</span> <span>${student.given_name}</span></li>
                    <li><span>Last Name:</span> <span>${student.last_name}</span></li>
                    <li><span>Email:</span> <span>${student.email}</span></li>
                    <li><span>Mobile:</span> <span>${student.mobile}</span></li>
                    <li class="dk-student-fee"><span>Fee:</span> <span>$${COURSE_COST_RAW.toFixed(2)}</span></li>
                </ul>
                <hr class="dk-summary-divider">
            </div>`;
        });
        
        // Totals (Initial Calculation)
        const initialTotalFee = (currentStudents.length * COURSE_COST_RAW).toFixed(2);
        html += `<h3 class="dk-summary-total" id="dk-total-fee-display">Total Fee: $${initialTotalFee}</h3>`;
        html += '</div>'; // End Summary Section
        
        $('#dk-step-2').html(html);
        
        // Attach Edit Link Handler
        $('.dk-edit-student-link').on('click', function(e) {
            e.preventDefault();
            goToStep(1); 
            // The logic to unlock the specific form on return is complex and is best done 
            // by relying on the user to click into the form they want to edit.
        });
    }

    // Renders the Payee and Coupon form (Step 2)
    function renderPaymentForm() {
         let html = '';
         // Payee Form HTML goes here (same four fields + checkboxes for copying)
         html += '<h3 class="dk-content-title">Payee Details</h3>';
         html += '<div class="dk-title-line"></div>';

         html += '<form id="dk-payee-form">';
         // We'll skip the actual payee form fields for now, as they don't involve API calls yet
         html += '<p><em>Payee form fields will be added here (First Name, Last Name, Email, Mobile, Copy Checkboxes).</em></p>';
         html += '</form>';

         // Coupon Code Section
         html += '<h3 class="dk-content-title">Coupon Code</h3>';
         html += '<div class="dk-title-line"></div>';
         html += `<div class="dk-coupon-area">
             <input type="text" id="dk-coupon-code" placeholder="Enter Coupon Code">
             <button id="dk-apply-coupon-btn" class="dk-btn dk-btn-secondary">Apply Coupon</button>
             <p id="dk-coupon-message"></p>
         </div>`;
         
         // Footer Nav Buttons
         html += `<div class="dk-button-group dk-nav-buttons">
            <button id="dk-back-to-details-btn" class="dk-btn dk-btn-primary dk-btn-50">&lt;&lt; Go Back</button>
            <button id="dk-pay-now-btn" class="dk-btn dk-btn-primary dk-btn-50">Pay Now</button>
        </div>`;
         
         $('#dk-step-2').append(html);
         
         // Attach event listeners for the new elements
         $('#dk-back-to-details-btn').on('click', function() { goToStep(1); });
         
         // *** Future Step: Coupon Button Logic ***
         $('#dk-apply-coupon-btn').on('click', handleCouponApplication);
         
         // *** Future Step: Pay Now Button Logic ***
         $('#dk-pay-now-btn').on('click', handlePayNow);
    }
    
    function handleCouponApplication() {
        // --- THIS WILL BE IMPLEMENTED IN THE NEXT PHASE ---
        alert('Coupon application logic is coming next!');
        // For demonstration:
        // const couponCode = $('#dk-coupon-code').val();
        // CALL AJAX: dk_ajax_calculate_discount
        // Update total cost: $('#dk-total-fee-display').text('Total Fee: $' + newCost);
        // Display message: $('#dk-coupon-message').text('Coupon Applied!').addClass('dk-success');
    }
    
    function handlePayNow() {
        alert('Pay Now clicked. Final API batch process starts here.');
    }


    // --- 4. Event Listeners (Step 1) ---
    
    // Initial Choice: Book for Myself
    $wrapper.on('click', '#dk-book-myself-btn', function() {
        currentStudents = []; // Clear any previous state
        currentFormIndex = 0;
        sessionStorage.removeItem(STORAGE_KEY);
        showStudentForms(true);
    });

    // Initial Choice: Book for Someone Else
    $wrapper.on('click', '#dk-book-someone-btn', function() {
        currentStudents = []; // Clear any previous state
        currentFormIndex = 0;
        sessionStorage.removeItem(STORAGE_KEY);
        showStudentForms(false);
    });

    // Action: Add New Student
    $wrapper.on('click', '#dk-add-new-student-btn', function() {
        processAndAddStudent(false);
    });

    // Action: Save Details / Final Student
    $wrapper.on('click', '#dk-save-details-btn', function() {
        processAndAddStudent(true); // Triggers confirmation on success
    });
    
    // Action: Delete Student
    $wrapper.on('click', '.dk-delete-student-btn', function() {
        const indexToDelete = parseInt($(this).data('index'));
        
        // Remove from array and storage
        currentStudents.splice(indexToDelete, 1);
        saveStudents();
        
        // Re-render the forms completely to fix indices and unlock the last form
        renderAllStudents(); 
        updateButtonVisibility();
    });

    // Action: << Go Back (From Form View to Initial View)
    $wrapper.on('click', '#dk-go-back-btn', function() {
        currentStudents = [];
        sessionStorage.removeItem(STORAGE_KEY);
        $('#dk-step-1-form-view').hide();
        $('#dk-step-1-initial-view').fadeIn();
    });
    
    // --- 5. Initialization and Re-load State ---
    
    // If we have saved data, skip the initial choice buttons
    if (currentStudents.length > 0) {
        showStudentForms(true); // Assumes 'Book for myself' to show forms
    }
});