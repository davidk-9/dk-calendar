<?php
// classes/dk_enrolment_flow.php

defined('ABSPATH') or die('No script kiddies please!');

/**
 * Renders the HTML template for a single Student Form iteration.
 * * @param int $index The student number (0, 1, 2, etc.)
 * @param array $student_data Existing data to pre-fill the form
 * @param bool $is_locked Flag to disable fields after saving
 * @param bool $show_delete Flag to show the delete button
 * @return string HTML
 */
function dk_render_student_form( $index, $student_data = [], $is_locked = false, $show_delete = false ) {
    // Sanitize data defensively
    $student_data = array_map('sanitize_text_field', $student_data);

    $disabled = $is_locked ? 'disabled' : '';
    $student_num = $index + 1;

    // Use default values if no data is provided
    $given_name = esc_attr($student_data['given_name'] ?? '');
    $last_name = esc_attr($student_data['last_name'] ?? '');
    $email = esc_attr($student_data['email'] ?? '');
    $mobile = esc_attr($student_data['mobile'] ?? '');
    // Checkbox values require boolean check
    $agreement_1 = isset($student_data['agreement_1']) && (bool)$student_data['agreement_1'] ? 'checked' : '';
    $agreement_2 = isset($student_data['agreement_2']) && (bool)$student_data['agreement_2'] ? 'checked' : '';
    
    ob_start();
    ?>
    <div class="dk-student-form-block" data-index="<?php echo $index; ?>" data-is-locked="<?php echo $is_locked ? 'true' : 'false'; ?>">
        <div class="dk-form-header">
            <h3 class="dk-student-title">Student <?php echo $student_num; ?></h3>
            <?php if ($show_delete) : ?>
                <button type="button" class="dk-btn dk-btn-delete dk-delete-student-btn" data-index="<?php echo $index; ?>">Delete Student</button>
            <?php endif; ?>
        </div>
        
        <form class="dk-student-form">
            <div class="dk-form-section dk-two-column-layout">
                <div class="dk-form-field">
                    <label for="dk_given_name_<?php echo $index; ?>">Given Name*</label>
                    <input type="text" id="dk_given_name_<?php echo $index; ?>" name="given_name" value="<?php echo $given_name; ?>" <?php echo $disabled; ?> required>
                </div>
                <div class="dk-form-field">
                    <label for="dk_last_name_<?php echo $index; ?>">Last Name*</label>
                    <input type="text" id="dk_last_name_<?php echo $index; ?>" name="last_name" value="<?php echo $last_name; ?>" <?php echo $disabled; ?> required>
                </div>
                <div class="dk-form-field">
                    <label for="dk_email_<?php echo $index; ?>">Email Address*</label>
                    <input type="email" id="dk_email_<?php echo $index; ?>" name="email" value="<?php echo $email; ?>" <?php echo $disabled; ?> required>
                </div>
                <div class="dk-form-field">
                    <label for="dk_mobile_<?php echo $index; ?>">Mobile*</label>
                    <input type="tel" id="dk_mobile_<?php echo $index; ?>" name="mobile" value="<?php echo $mobile; ?>" <?php echo $disabled; ?> required>
                </div>
            </div>

            <div class="dk-form-section dk-one-column-layout">
                <div class="dk-checkbox-field">
                    <input type="checkbox" id="dk_agreement_1_<?php echo $index; ?>" name="agreement_1" value="1" <?php echo $agreement_1; ?> <?php echo $disabled; ?> required>
                    <label for="dk_agreement_1_<?php echo $index; ?>">I understand the online learning and assessment component of the course must be completed before I can attend my scheduled in person session.</label>
                </div>
                <div class="dk-checkbox-field">
                    <input type="checkbox" id="dk_agreement_2_<?php echo $index; ?>" name="agreement_2" value="1" <?php echo $agreement_2; ?> <?php echo $disabled; ?> required>
                    <label for="dk_agreement_2_<?php echo $index; ?>">I am physically able to perform CPR in a kneeling position on the floor for 2 minutes.</label>
                </div>
            </div>
        </form>
    </div>
    <?php
    return ob_get_clean();
}


/**
 * AJAX handler to render the student form HTML template for JavaScript.
 */
function dk_ajax_render_student_form_html() {
    // Nonce check is not critical here as no data is being saved, only HTML rendered,
    // but in a live environment, always include check_ajax_referer('dk_enrolment_nonce', 'security');

    // Sanitize input
    $index = intval($_POST['index'] ?? 0);
    // Use wp_unslash and wp_kses_post for safety on arrays coming from JS
    $student_data = array_map('wp_kses_post', wp_unslash($_POST['student_data'] ?? []));
    $is_locked = filter_var($_POST['is_locked'] ?? false, FILTER_VALIDATE_BOOLEAN);
    $show_delete = filter_var($_POST['show_delete'] ?? false, FILTER_VALIDATE_BOOLEAN);
    
    // Render the form using the PHP function
    $html = dk_render_student_form($index, $student_data, $is_locked, $show_delete);
    
    wp_send_json_success(['html' => $html]);
    wp_die();
}


/**
 * Handles the Enrolment Flow Shortcode [dk_enrolment_flow]
 */
function dk_enrolment_flow_shortcode_output( $atts ) {
    
    // --- 1. Get Course Data from URL Parameters ---
    $course_data = array_map('sanitize_text_field', $_GET);
    
    $instance_id = $course_data['instance_id'] ?? null;
    $course_name = $course_data['course_name'] ?? 'N/A';
    $course_date = $course_data['course_date'] ?? 'N/A';
    $course_location = $course_data['course_location'] ?? 'N/A';
    $course_time = $course_data['course_time'] ?? 'N/A';
    $course_cost_raw = $course_data['course_cost'] ?? '$0.00';
    $course_code = $course_data['course_code'] ?? 'N/A';
    // Using instance_id to pull max spaces from cache for a more robust check (FUTURE STEP)
    $spaces_avail = intval($course_data['spaces_avail'] ?? 99); 

    if (empty($instance_id)) {
        return '<div class="dk-enrolment-error">Error: Course Instance ID is missing. Please select a course from the calendar.</div>';
    }

    // --- 2. Get Step Titles from Settings (Defaulted) ---
    $step_titles = [
        get_option('dk_enrol_step_1_title', 'Student Details'),
        get_option('dk_enrol_step_2_title', 'Payment'),
        get_option('dk_enrol_step_3_title', 'Enrolment Complete')
    ];

    ob_start();
    ?>
    <div id="dk-enrolment-wrapper" class="dk-responsive-container">
        
        <div class="dk-course-header">
            <h3>Enrolling in: <?php echo esc_html($course_name); ?> (<?php echo esc_html($course_code); ?>)</h3>
            <p><strong>Date:</strong> <?php echo esc_html($course_date); ?> | <strong>Time:</strong> <?php echo esc_html($course_time); ?> | <strong>Location:</strong> <?php echo esc_html($course_location); ?> | <strong>Cost/Student:</strong> <?php echo esc_html($course_cost_raw); ?></p>
        </div>
        
        <div class="dk-tab-control-container">
            
            <div class="dk-tab-nav">
                <?php foreach ($step_titles as $index => $title) : 
                    $step_num = $index + 1;
                    $is_active = $step_num === 1 ? 'dk-active-tab' : '';
                ?>
                    <div class="dk-tab-item dk-step-<?php echo $step_num; ?> <?php echo $is_active; ?>" data-step="<?php echo $step_num; ?>">
                        <span class="dk-step-number"><?php echo $step_num; ?></span> <?php echo esc_html($title); ?>
                    </div>
                <?php endforeach; ?>
            </div>
            
            <div class="dk-tab-content-area">
                
                <div id="dk-step-1" class="dk-step-content dk-active-content" data-instance-id="<?php echo esc_attr($instance_id); ?>" data-instance-cost="<?php echo esc_attr(floatval(str_replace(['$', ','], '', $course_cost_raw))); ?>" data-spaces-avail="<?php echo esc_attr($spaces_avail); ?>" data-course-type="w" style="display:block;">
                    
                    <div id="dk-step-1-initial-view">
                        <h2 class="dk-content-title">Student Details</h2>
                        <div class="dk-title-line"></div>
                        
                        <div class="dk-button-group dk-initial-buttons">
                            <button id="dk-book-myself-btn" class="dk-btn dk-btn-primary dk-btn-50">Book for myself +</button>
                            <button id="dk-book-someone-btn" class="dk-btn dk-btn-primary dk-btn-50">Book for someone else +</button>
                        </div>
                    </div>
                    
                    <div id="dk-step-1-form-view" style="display:none;">
                        <h2 class="dk-content-title" id="dk-form-view-title">Book for Myself</h2>
                        <div class="dk-title-line"></div>
                        
                        <div id="dk-student-forms-container">
                            </div>

                        <div class="dk-form-footer">
                            <button id="dk-add-new-student-btn" class="dk-btn dk-btn-secondary dk-add-student-btn" style="display:none;">Add New Student +</button>
                            
                            <div class="dk-button-group dk-nav-buttons">
                                <button id="dk-go-back-btn" class="dk-btn dk-btn-primary dk-btn-50">&lt;&lt; Go Back</button>
                                <button id="dk-save-details-btn" class="dk-btn dk-btn-primary dk-btn-50">Save Details</button>
                            </div>
                        </div>

                        <div id="dk-validation-message" class="dk-error-box" style="display:none;"></div>
                    </div>

                </div>
                
                <div id="dk-step-2" class="dk-step-content" style="display:none;">
                    </div>

                <div id="dk-step-3" class="dk-step-content" style="display:none;">
                    <h2 class="dk-content-title">Enrolment Complete</h2>
                    <div class="dk-title-line"></div>
                    <div id="dk-completion-message">
                        <p>Your booking is being processed. Thank you!</p>
                    </div>
                </div>
            </div>
            
        </div>
    </div>
    <?php
    return ob_get_clean();
}