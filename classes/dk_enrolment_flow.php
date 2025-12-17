<?php
// classes/dk_enrolment_flow.php

defined('ABSPATH') or die('No script kiddies please!');

// Include Axcelerate API helper
require_once __DIR__ . '/dk_axcelerate_api.php';

/**
 * Renders the HTML template for a single form iteration.
 * Supports form types: 'student' (includes agreements) and 'payee'/'booking_contact' (no agreements).
 * @param int $index The form number (0, 1, 2, etc.)
 * @param array $student_data Existing data to pre-fill the form
 * @param bool $is_locked Flag to disable fields after saving
 * @param bool $show_delete Flag to show the delete button
 * @param string $form_type 'student'|'payee'|'booking_contact'
 * @param string|null $title Optional title to display instead of default
 * @return string HTML
 */
function dk_render_student_form( $index, $student_data = [], $is_locked = false, $show_delete = false, $form_type = 'student', $title = null ) {
    // Sanitize data defensively
    $student_data = array_map('sanitize_text_field', $student_data);

    $disabled = $is_locked ? 'disabled' : '';
    $student_num = $index + 1;

    // Use default values if no data is provided
    $given_name = esc_attr($student_data['given_name'] ?? '');
    $last_name = esc_attr($student_data['last_name'] ?? '');
    $email = esc_attr($student_data['email'] ?? '');
    $mobile = esc_attr($student_data['mobile'] ?? '');
    // Checkbox values require boolean check (only for student forms)
    $agreement_1 = isset($student_data['agreement_1']) && (bool)$student_data['agreement_1'] ? 'checked' : '';
    $agreement_2 = isset($student_data['agreement_2']) && (bool)$student_data['agreement_2'] ? 'checked' : '';
    
    ob_start();
    ?>
    <div class="dk-student-form-block" data-index="<?php echo $index; ?>" data-is-locked="<?php echo $is_locked ? 'true' : 'false'; ?>" data-form-type="<?php echo esc_attr($form_type); ?>">
        <div class="dk-form-header">
            <h3 class="dk-student-title">
                <?php
                if ( $title ) {
                    echo esc_html( $title );
                } else {
                    if ( $form_type === 'payee' || $form_type === 'booking_contact' ) {
                        echo 'Your Details';
                    } else {
                        echo 'Student ' . $student_num;
                    }
                }
                ?>
            </h3>
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
                <?php if ( $form_type === 'student' ) : ?>
                <div class="dk-checkbox-field">
                    <input type="checkbox" id="dk_agreement_1_<?php echo $index; ?>" name="agreement_1" value="1" <?php echo $agreement_1; ?> <?php echo $disabled; ?> required>
                    <label for="dk_agreement_1_<?php echo $index; ?>">I understand the online learning and assessment component of the course must be completed before I can attend my scheduled in person session.</label>
                </div>
                <div class="dk-checkbox-field">
                    <input type="checkbox" id="dk_agreement_2_<?php echo $index; ?>" name="agreement_2" value="1" <?php echo $agreement_2; ?> <?php echo $disabled; ?> required>
                    <label for="dk_agreement_2_<?php echo $index; ?>">I am physically able to perform CPR in a kneeling position on the floor for 2 minutes.</label>
                </div>
                <?php endif; ?>
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
    $form_type = sanitize_text_field( $_POST['form_type'] ?? 'student' );
    $title = isset( $_POST['title'] ) ? sanitize_text_field( $_POST['title'] ) : null;

    // Render the form using the PHP function
    $html = dk_render_student_form($index, $student_data, $is_locked, $show_delete, $form_type, $title);
    
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
                            <button id="dk-book-myself-btn" class="dk-btn dk-btn-primary dk-btn-50">Book For Myself</button>
                            <button id="dk-book-someone-btn" class="dk-btn dk-btn-primary dk-btn-50">Book For Someone Else</button>
                            <button id="dk-book-group-btn" class="dk-btn dk-btn-primary dk-btn-50">Book For a Group (2+)</button>
                        </div>
                    </div>

                    <div id="dk-step-1-group-setup" style="display:none;">
                        <h2 class="dk-content-title">Group Booking Setup</h2>
                        <div class="dk-title-line"></div>

                        <div class="dk-form-section dk-two-column-layout">
                            <div class="dk-form-field">
                                <label for="dk_group_count">How many students will be in your group</label>
                                <div class="dk-number-control">
                                    <button type="button" id="dk_group_count_decr" class="dk-num-btn">-</button>
                                    <input type="number" id="dk_group_count" value="2" min="2" style="width:4em;text-align:center;" />
                                    <button type="button" id="dk_group_count_incr" class="dk-num-btn">+</button>
                                </div>
                            </div>
                            <div class="dk-form-field">
                                <label>Are you part of the group of students?</label>
                                <div>
                                    <label><input type="radio" name="dk_group_member_toggle" value="yes" checked /> Yes</label>
                                    <label style="margin-left:1em;"><input type="radio" name="dk_group_member_toggle" value="no" /> No</label>
                                </div>
                            </div>
                        </div>

                        <div class="dk-button-group dk-nav-buttons" style="margin-top:1em;">
                            <button id="dk-group-go-back-btn" class="dk-btn dk-btn-secondary">&lt;&lt; Go Back</button>
                            <button id="dk-group-continue-btn" class="dk-btn dk-btn-primary">Continue</button>
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


/**
 * AJAX handler to synchronise contacts with Axcelerate.
 * Accepts POST `state` (array or JSON) containing `payee` and `students`.
 * Returns the same structure with `ax_contact_id` set for each person on success.
 */
// Register single-contact sync handler (standalone AJAX endpoint)
add_action( 'wp_ajax_dk_sync_contact', 'dk_ajax_sync_contact' );
add_action( 'wp_ajax_nopriv_dk_sync_contact', 'dk_ajax_sync_contact' );
function dk_ajax_sync_contact() {
    $given = sanitize_text_field( $_POST['given_name'] ?? '' );
    $surname = sanitize_text_field( $_POST['last_name'] ?? '' );
    $email = sanitize_email( $_POST['email'] ?? '' );
    $mobile = sanitize_text_field( $_POST['mobile'] ?? '' );

    if ( empty($given) && empty($surname) && empty($email) ) {
        wp_send_json_error( array('message' => 'Contact details missing') );
        wp_die();
    }

    $api = new DK_Axcelerate_API();

    $search = $api->search_contacts($given, $surname, $email);
    if ( is_wp_error($search) ) {
        wp_send_json_error( array('message' => $search->get_error_message()) );
        wp_die();
    }

    if ( is_array($search) && count($search) > 0 ) {
        $first = $search[0];
        wp_send_json_success( array('contactID' => intval($first['CONTACTID'] ?? 0)) );
        wp_die();
    }

    // Create
    $payload = array(
        'givenName' => $given,
        'surname' => $surname,
        'emailAddress' => $email,
        'mobilephone' => $mobile
    );

    $created = $api->create_contact($payload);
    if ( is_wp_error($created) ) {
        wp_send_json_error( array('message' => $created->get_error_message()) );
        wp_die();
    }

    if ( is_array($created) && isset($created['CONTACTID']) ) {
        wp_send_json_success( array('contactID' => intval($created['CONTACTID'])) );
        wp_die();
    }

    wp_send_json_error( array('message' => 'Unexpected create response', 'raw' => $created) );
    wp_die();
}

// Register discount check handler (standalone AJAX endpoint)
add_action( 'wp_ajax_dk_check_discount', 'dk_ajax_check_discount' );
add_action( 'wp_ajax_nopriv_dk_check_discount', 'dk_ajax_check_discount' );
function dk_ajax_check_discount() {
    $contactID = intval( $_POST['contactID'] ?? 0 );
    $instanceID = intval( $_POST['instanceID'] ?? 0 );
    $originalPrice = floatval( $_POST['originalPrice'] ?? 0 );
    $promoCode = sanitize_text_field( $_POST['promoCode'] ?? '' );

    if ( empty($promoCode) ) {
        wp_send_json_error( array('message' => 'Promo code required') );
        wp_die();
    }
    if ( $contactID <= 0 || $instanceID <= 0 ) {
        wp_send_json_error( array('message' => 'Missing contactID or instanceID') );
        wp_die();
    }

    $api = new DK_Axcelerate_API();
    $res = $api->get_discounts($contactID, 'w', $instanceID, $originalPrice, $promoCode);
    if ( is_wp_error($res) ) {
        wp_send_json_error( array('message' => $res->get_error_message(), 'raw' => $res->get_error_data()) );
        wp_die();
    }

    // Expected response contains INITIALPRICE, REVISEDPRICE, DISCOUNTSAPPLIED array
    $discountApplied = [];
    $revisedPrice = $originalPrice;
    if ( is_array($res) ) {
        if ( isset($res['REVISEDPRICE']) ) $revisedPrice = $res['REVISEDPRICE'];
        if ( isset($res['DISCOUNTSAPPLIED']) && is_array($res['DISCOUNTSAPPLIED']) && count($res['DISCOUNTSAPPLIED'])>0 ) {
            $first = $res['DISCOUNTSAPPLIED'][0];
            $discountApplied = array(
                'DISCOUNTID' => isset($first['DISCOUNTID']) ? intval($first['DISCOUNTID']) : 0,
                'NAME' => $first['NAME'] ?? '',
                'REVISEDPRICE' => isset($first['REVISEDPRICE']) ? $first['REVISEDPRICE'] : $revisedPrice,
            );
        }
    }

    wp_send_json_success( array('revisedPrice' => $revisedPrice, 'discount' => $discountApplied, 'raw' => $res) );
    wp_die();
}
add_action( 'wp_ajax_dk_sync_contacts', 'dk_ajax_sync_contacts' );
add_action( 'wp_ajax_nopriv_dk_sync_contacts', 'dk_ajax_sync_contacts' );
function dk_ajax_sync_contacts() {
    // Accept a JSON string or an array
    $raw = wp_unslash( $_POST['state'] ?? '' );
    if ( empty($raw) ) {
        wp_send_json_error( array('message' => 'Missing state payload') );
        wp_die();
    }


    $state = null;
    if ( is_string($raw) ) {
        $state = json_decode( $raw, true );
    } elseif ( is_array($raw) ) {
        $state = $raw;
    }

    if ( ! is_array($state) ) {
        wp_send_json_error( array('message' => 'Invalid state payload') );
        wp_die();
    }

    $api = new DK_Axcelerate_API();
    $errors = array();

    // Helper to process one person record; returns contact id or WP_Error
    $process_person = function($person) use ($api) {
        $given = sanitize_text_field($person['given_name'] ?? '');
        $surname = sanitize_text_field($person['last_name'] ?? '');
        $email = sanitize_email( $person['email'] ?? '' );
        $mobile = sanitize_text_field($person['mobile'] ?? '');

        // Try search
        $search = $api->search_contacts($given, $surname, $email);
        if ( is_wp_error($search) ) return $search;

        if ( is_array($search) && count($search) > 0 ) {
            // Use first match
            $first = $search[0];
            return intval($first['CONTACTID'] ?? 0);
        }

        // Not found -> create
        $payload = array(
            'givenName' => $given,
            'surname' => $surname,
            'emailAddress' => $email,
        );
        if (!empty($mobile)) $payload['mobilePhone'] = $mobile;

        $created = $api->create_contact($payload);
        if ( is_wp_error($created) ) return $created;
        if ( is_array($created) && isset($created['CONTACTID']) ) return intval($created['CONTACTID']);
        // Unexpected response
        return new WP_Error('no_contact_id', 'Create contact response missing CONTACTID');
    };

    // Process payee
    if ( isset($state['payee']) && is_array($state['payee']) ) {
        $res = $process_person($state['payee']);
        if ( is_wp_error($res) ) {
            $errors[] = 'Payee: ' . $res->get_error_message();
        } else {
            $state['payee']['ax_contact_id'] = $res;
        }
    }

    // Process students
    if ( isset($state['students']) && is_array($state['students']) ) {
        foreach ( $state['students'] as $i => $student ) {
            if ( !is_array($student) ) continue;
            $res = $process_person($student);
            if ( is_wp_error($res) ) {
                $errors[] = 'Student ' . ($i+1) . ': ' . $res->get_error_message();
            } else {
                $state['students'][$i]['ax_contact_id'] = $res;
            }
        }
    }

    if ( ! empty($errors) ) {
        wp_send_json_error( array('message' => 'One or more contacts failed to sync', 'errors' => $errors, 'state' => $state) );
    } else {
        wp_send_json_success( array('message' => 'Contacts synced', 'state' => $state) );
    }

    wp_die();
}