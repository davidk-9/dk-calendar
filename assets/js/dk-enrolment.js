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
    // Track which top-level flow is active: 'initial' | 'single' | 'someone' | 'group-setup' | 'group'
    let activeFlow = 'initial';

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
    function renderFormsForBooking(payeeIsStudent, isGroupFlow = false) {
        const $container = $('#dk-student-forms-container').empty();

        // If called as part of an explicit group flow, set the title accordingly
        if (isGroupFlow) {
            $('#dk-form-view-title').text('Booking for a Group');
        }

        // Build ordered request list so we can append responses in sequence
        const requests = [];
        if (payeeIsStudent) {
            // First form is both student1 and payee
            requests.push({ index: 0, type: 'student', title: 'Your Details (Student 1 & Booking Contact)', data: state.students[0] || {}, showDelete: false });
            for (let i = 1; i < state.students.length; i++) {
                requests.push({ index: i, type: 'student', title: 'Student ' + (i+1) + ' Details', data: state.students[i] || {}, showDelete: true });
            }
        } else {
            // First form is booking contact (payee)
            requests.push({ index: 0, type: 'payee', title: 'Your Details (Booking Contact)', data: state.payee || {}, showDelete: false });
            for (let i = 0; i < state.students.length; i++) {
                requests.push({ index: i+1, type: 'student', title: 'Student ' + (i+1) + ' Details', data: state.students[i] || {}, showDelete: (i+1) > 1 });
            }
        }

        // Execute requests sequentially to preserve display order
        let chain = $.Deferred().resolve();
        requests.forEach(function(req) {
            chain = chain.then(function() {
                return requestForm(req.index, req.type, req.title, req.data, false, req.showDelete).done(function(r) {
                    $container.append(r.data.html);
                }).fail(function() {
                    $container.append('<p class="dk-loading">Failed to load a form.</p>');
                });
            });
        });
        return chain.promise();
    }

    // Generic render for single-person bookings (book myself / someone else single student)
    function renderSingleFlow(showPayeeAsStudent, isBookForMyself) {
        // mark flow for navigation/back behavior
        activeFlow = isBookForMyself ? 'single' : 'someone';
        $('#dk-step-1-initial-view, #dk-step-1-group-setup').hide();
        $('#dk-step-1-form-view').show();
        // Immediate title to reduce perceived latency
        $('#dk-form-view-title').text(isBookForMyself ? 'Book for Myself' : (showPayeeAsStudent ? 'Book For Someone Else' : 'Booking'));
        const $container = $('#dk-student-forms-container');

        // Show loading placeholder while AJAX form is requested
        $container.html('<p class="dk-loading">Loading Details Forms...</p>');

        if (isBookForMyself) {
            // Request student form only, no add button
            requestForm(0, 'student', 'Your Details (Student)', state.students[0] || {}, false, false).done(function(r) {
                $container.empty().append(r.data.html);
            }).fail(function(){ $container.html('<p class="dk-loading">Failed to load form. Please try again.</p>'); });
            $('#dk-add-new-student-btn').hide();
        } else {
            // Booking contact + student
            // First: booking contact (payee)
                requestForm(0, 'payee', 'Your Details (Booking Contact)', state.payee || {}, false, false).done(function(r) {
                $container.empty().append(r.data.html);
                // then student (do NOT show delete button here — always require at least one student)
                requestForm(1, 'student', 'Student Details', state.students[0] || {}, false, false).done(function(r2) {
                    $container.append(r2.data.html);
                }).fail(function(){ $container.append('<p class="dk-loading">Failed to load student form.</p>'); });
            }).fail(function(){ $container.html('<p class="dk-loading">Failed to load forms. Please try again.</p>'); });
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
                if (known[i]) newStudents.push(known[i]); else newStudents.push({});
            }
            newPayee = null; // payee is represented as student[0]
        } else {
            // payee separate
            if (state.payee && Object.keys(state.payee).length) {
                newPayee = state.payee;
                const knownStudents = state.students ? state.students.slice() : [];
                for (let i = 0; i < count; i++) {
                    if (knownStudents[i]) newStudents.push(knownStudents[i]); else newStudents.push({});
                }
            } else if (state.students && state.students.length) {
                // promote first existing student to be payee and shift remaining students
                newPayee = state.students[0];
                const remaining = state.students.slice(1);
                for (let i = 0; i < count; i++) {
                    if (remaining[i]) newStudents.push(remaining[i]); else newStudents.push({});
                }
            } else {
                // no known data
                newPayee = {};
                for (let i = 0; i < count; i++) newStudents.push({});
            }
        }

        // Trim trailing empty students if new count is smaller than before
        // (the above construction already set exact length)
        state.payee = newPayee;
        state.students = newStudents;
        saveState();

        // Render forms accordingly and show form-view
        $('#dk-step-1-group-setup').hide();
        $('#dk-step-1-form-view').show();
        $('#dk-add-new-student-btn').show();
        activeFlow = 'group';
        // Render forms: using renderFormsForBooking (mark as group flow so title updates)
        renderFormsForBooking(partOfGroup, true).done(function() {
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

    // If we have saved data, go to step 1 and render forms accordingly so users can continue
    if (state.payee || (state.students && state.students.length>0)) {
        // Decide rendering mode
        const payeeIsStudent = !state.payee && (state.students && state.students.length>0);
        // If there are multiple students, assume this was a group flow
        if (state.students && state.students.length > 1) activeFlow = 'group';
        $('#dk-step-1-initial-view').hide();
        $('#dk-step-1-form-view').show();
        $('#dk-add-new-student-btn').toggle( (state.students.length>1) );
        renderFormsForBooking(payeeIsStudent, activeFlow === 'group');
    }

    // --- Navigation: goToStep and Step 2 renderer ---
    function goToStep(step) {
        if (step < 1 || step > 3) return;
        // Hide all step contents and clear active tabs
        $('.dk-step-content').hide();
        $('.dk-tab-item').removeClass('dk-active-tab');

        // Show selected content and mark tab active
        $(`#dk-step-${step}`).show();
        $(`.dk-tab-item.dk-step-${step}`).addClass('dk-active-tab');

        if (step === 2) {
            renderStep2();
        }
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

                html += '<div class="dk-summary-student-item">';
                html += '<div class="dk-student-details-row"><h4>Student ' + num + '</h4><a href="#" class="dk-edit-student-link" data-index="' + idx + '">&lt;&lt; Edit Student Details</a></div>';
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
        html += '<button id="dk-apply-promo-btn" class="dk-btn dk-btn-secondary">' + (promoLocked ? 'Clear Promotion Code' : 'Apply Promotion Code') + '</button>';
        html += '</div>';
        html += '<div id="dk-promo-status" class="dk-promo-status" style="margin-top:8px;color:#333;"></div>';

        // Pay button placeholder
        html += '<div class="dk-button-group dk-nav-buttons" style="margin-top:20px;">';
        html += '<button id="dk-back-to-details-btn" class="dk-btn dk-btn-secondary dk-btn-50"><< Go Back</button>';
        html += '<button id="dk-pay-now-btn" class="dk-btn dk-btn-primary dk-btn-50">Pay Now</button>';
        html += '</div>';

        $step2.append(html);

        // Attach handlers
        $('#dk-back-to-details-btn').on('click', function(){ goToStep(1); });

        // Apply / Clear promotion code button handler
        $('#dk-apply-promo-btn').off('click').on('click', function(){
            // If promo already applied, this button clears it
            if (state.promo && state.promo.code) {
                // Clear discounts and promo
                if (state.students && state.students.length) {
                    state.students.forEach(function(s){ delete s.revised_price; delete s.discount_id; });
                }
                delete state.promo;
                saveState();
                $('#dk-promo-status').css('color','#333').text('Promotion cleared.');
                renderStep2();
                return;
            }

            const promo = $('#dk-promo-code').val().trim();
            if (!promo) { alert('Please enter a promo code.'); return; }

            // Ensure contacts exist (create/search) before requesting discounts
            const currentState = loadState();
            const ensureContacts = function() {
                const ops = [];
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
                if (currentState.payee && (!currentState.payee.ax_contact_id && !currentState.payee.ax_contact)) {
                    ops.push(syncOne(currentState.payee, 0, 'payee'));
                }
                if (currentState.students && currentState.students.length) {
                    currentState.students.forEach(function(s, i){
                        if (!s.ax_contact_id && !s.ax_contact) {
                            ops.push(syncOne(s, i, 'students'));
                        }
                    });
                }
                if (ops.length === 0) {
                    const d = $.Deferred(); d.resolve({ success:true, data:{ state: currentState } }); return d.promise();
                }
                return $.when.apply($, ops).then(function(){ return { success:true, data:{ state: currentState } }; }, function(){ return $.Deferred().resolve({ success:false, data:{ message: 'One or more contact syncs failed', state: currentState } }); });
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
                    $('#dk-promo-status').text('Contact sync returned errors. See console.');
                    $('#dk-apply-promo-btn').prop('disabled', false);
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
                        saveState();
                        $('#dk-promo-status').css('color','green').text('Promotion applied: ' + appliedCount + ' student(s) received a discount.');
                    } else {
                        $('#dk-promo-status').css('color','red').text('No discounts applied — code invalid or expired.');
                    }
                    $('#dk-apply-promo-btn').prop('disabled', false);
                    renderStep2();
                });

            }).fail(function(xhr){ console.error('Contact sync AJAX error', xhr.responseText); alert('Failed to ensure contacts. See console for details.'); });
        });
    }
});