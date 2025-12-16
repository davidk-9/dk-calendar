// assets/js/dk-enrolment.js

jQuery(document).ready(function($) {
    const $wrapper = $('#dk-enrolment-wrapper');
    if (!$wrapper.length || typeof DKEnrolmentData === 'undefined') return;

    // --- Core Data and State Management ---
    const STORAGE_KEY = 'dk_enrolment_state';
    const COURSE_COST_RAW = parseFloat($('#dk-step-1').data('instance-cost')) || 0;
    const SPACES_AVAIL = parseInt($('#dk-step-1').data('spaces-avail')) || 999;
    const INSTANCE_ID = $('#dk-step-1').data('instance-id');

    // State shape: { payee: {...} | null, students: [ {...}, ... ] }
    let state = loadState();

    function loadState() {
        try {
            return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || { payee: null, students: [] };
        } catch (e) {
            return { payee: null, students: [] };
        }
    }
    function saveState() {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function clearState() {
        state = { payee: null, students: [] };
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

    // Render helpers: request a form HTML from server
    function requestForm(index, formType = 'student', title = null, data = {}, isLocked = false, showDelete = false, syncAppend = true) {
        return $.ajax({
            url: DKEnrolmentData.ajax_url,
            type: 'POST',
            data: {
                action: 'dk_render_student_form_html',
                index: index,
                student_data: data,
                is_locked: isLocked,
                show_delete: showDelete,
                form_type: formType,
                title: title
            }
        });
    }

    // Render multiple forms based on state
    function renderFormsForBooking(payeeIsStudent) {
        const $container = $('#dk-student-forms-container').empty();
        let promises = [];

        if (payeeIsStudent) {
            // First form is both student1 and payee
            promises.push(requestForm(0, 'student', 'Your Details (Student 1 & Booking Contact)', state.students[0] || {}, false, false).then(r => $container.append(r.data.html)));
            for (let i = 1; i < state.students.length; i++) {
                promises.push(requestForm(i, 'student', 'Student ' + (i+1) + ' Details', state.students[i] || {}, false, true).then(r => $container.append(r.data.html)));
            }
        } else {
            // First form is booking contact (payee)
            promises.push(requestForm(0, 'payee', 'Your Details (Booking Contact)', state.payee || {}, false, false).then(r => $container.append(r.data.html)));
            for (let i = 0; i < state.students.length; i++) {
                promises.push(requestForm(i+1, 'student', 'Student ' + (i+1) + ' Details', state.students[i] || {}, false, (i+1) > 1).then(r => $container.append(r.data.html)));
            }
        }

        return $.when.apply($, promises);
    }

    // Generic render for single-person bookings (book myself / someone else single student)
    function renderSingleFlow(showPayeeAsStudent, isBookForMyself) {
        $('#dk-step-1-initial-view, #dk-step-1-group-setup').hide();
        $('#dk-step-1-form-view').show();
        $('#dk-form-view-title').text(isBookForMyself ? 'Your Details (Student)' : (showPayeeAsStudent ? 'Your Details (Booking Contact)' : 'Booking'));
        const $container = $('#dk-student-forms-container').empty();

        if (isBookForMyself) {
            // Request student form only, no add button
            requestForm(0, 'student', 'Your Details (Student)', state.students[0] || {}, false, false).done(function(r) {
                $container.append(r.data.html);
            });
            $('#dk-add-new-student-btn').hide();
        } else {
            // Booking contact + student
            // First: booking contact (payee)
            requestForm(0, 'payee', 'Your Details (Booking Contact)', state.payee || {}, false, false).done(function(r) {
                $container.append(r.data.html);
                // then student
                requestForm(1, 'student', 'Student Details', state.students[0] || {}, false, true).done(function(r2) {
                    $container.append(r2.data.html);
                });
            });
            $('#dk-add-new-student-btn').hide();
        }
    }

    // --- Event handlers for initial buttons ---
    $wrapper.on('click', '#dk-book-myself-btn', function() {
        clearState();
        // Show single student form; this person is both student1 and payee
        renderSingleFlow(true, true);
    });

    $wrapper.on('click', '#dk-book-someone-btn', function() {
        clearState();
        renderSingleFlow(true, false);
    });

    $wrapper.on('click', '#dk-book-group-btn', function() {
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
    });

    // Continue from group setup
    $wrapper.on('click', '#dk-group-continue-btn', function() {
        const count = Math.max(2, Math.min(parseInt($('#dk_group_count').val()) || 2, parseInt($('#dk_group_count').attr('max')) || SPACES_AVAIL));
        const partOfGroup = $('input[name="dk_group_member_toggle"]:checked').val() === 'yes';

        // Build state arrays
        state = { payee: null, students: [] };
        if (partOfGroup) {
            // First student is the payee
            // initialize students with placeholders
            for (let i=0;i<count;i++) state.students.push({});
        } else {
            // payee separate
            state.payee = {};
            for (let i=0;i<count;i++) state.students.push({});
        }
        saveState();

        // Render forms accordingly and show form-view
        $('#dk-step-1-group-setup').hide();
        $('#dk-step-1-form-view').show();
        $('#dk-add-new-student-btn').show();

        // Render forms: using renderFormsForBooking
        renderFormsForBooking(partOfGroup).done(function() {
            // nothing extra
        });
    });

    // Add new student button (in group flows)
    $wrapper.on('click', '#dk-add-new-student-btn', function() {
        if (state.students.length >= SPACES_AVAIL) { alert('Maximum number of students reached!'); return; }
        state.students.push({});
        saveState();
        // request form for next index
        const newIndex = state.students.length - 1 + (state.payee ? 1 : 0);
        const title = 'Student ' + (state.students.length) + ' Details';
        requestForm(newIndex, 'student', title, {}, false, true).done(function(r) { $('#dk-student-forms-container').append(r.data.html); });
    });

    // Delete student handler (delegated)
    $wrapper.on('click', '.dk-delete-student-btn', function() {
        const idx = parseInt($(this).data('index'));
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
        // Return to initial screen (or group setup if applicable)
        $('#dk-step-1-form-view').hide();
        $('#dk-step-1-initial-view').show();
        $('#dk-student-forms-container').empty();
        clearState();
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

    // If we have saved data, go to step 1 and render forms accordingly so users can continue
    if (state.payee || (state.students && state.students.length>0)) {
        // Decide rendering mode
        const payeeIsStudent = !state.payee && (state.students && state.students.length>0);
        $('#dk-step-1-initial-view').hide();
        $('#dk-step-1-form-view').show();
        $('#dk-add-new-student-btn').toggle( (state.students.length>1) );
        renderFormsForBooking(payeeIsStudent);
    }
});