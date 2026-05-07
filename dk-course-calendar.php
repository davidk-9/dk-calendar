<?php
/**
 * Plugin Name: DK Custom Course Calendar
 * Plugin URI: https://lifesavingfirstaid.com.au/
 * Description: A custom, high-performance course calendar using Axcelerate API polling and webhooks.
 * Version: 1.0.4
 * Author: Your Name
 * Author URI: https://lifesavingfirstaid.com.au/
 * License: GPL2
 */

// Define the root file for security and path reference
if ( ! defined( 'DK_CALENDAR_FILE' ) ) {
    define( 'DK_CALENDAR_FILE', __FILE__ );
}

// Exit if accessed directly for security
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// ====================================================================
// NEW: L. ENROLMENT FLOW INCLUSION (Before A)
// ====================================================================

// Include the new logic and API helper files
include_once plugin_dir_path( __FILE__ ) . 'classes/dk_enrolment_flow.php';
// NOTE: dk_axcelerate_api_helper.php is included inside dk_enrolment_flow.php later

// Include legacy functions from theme functions.php (for backwards compatibility)
include_once plugin_dir_path( __FILE__ ) . 'dk-legacy-functions.php';

// Register the new shortcode
add_shortcode( 'dk_enrolment_flow', 'dk_enrolment_flow_shortcode_output' );

// Register the AJAX handler for rendering the student form HTML
add_action( 'wp_ajax_dk_render_student_form_html', 'dk_ajax_render_student_form_html' );
add_action( 'wp_ajax_nopriv_dk_render_student_form_html', 'dk_ajax_render_student_form_html' );

// Register external cron endpoint
add_action( 'wp_ajax_dk_manual_sync', 'dk_ajax_manual_sync' );
add_action( 'wp_ajax_nopriv_dk_manual_sync', 'dk_ajax_manual_sync' );


// ====================================================================
// A. ACTIVATION & DEACTIVATION HOOKS (Setup and Cleanup)
// ====================================================================

register_activation_hook( DK_CALENDAR_FILE, 'dk_calendar_activate' );
register_deactivation_hook( DK_CALENDAR_FILE, 'dk_calendar_deactivate' );
add_action( 'dk_calendar_nightly_sync', 'dk_calendar_perform_sync' );

function dk_calendar_activate() {
    // 1. Create the database table
    dk_calendar_create_db_table();
    
    // 2. Schedule the initial sync to run once nightly
    if ( ! wp_next_scheduled( 'dk_calendar_nightly_sync' ) ) {
        wp_schedule_event( time(), 'daily', 'dk_calendar_nightly_sync' );
    }
}

function dk_calendar_deactivate() {
    // Clear any pending scheduled events for this plugin
    $timestamp = wp_next_scheduled( 'dk_calendar_nightly_sync' );
    wp_unschedule_event( $timestamp, 'dk_calendar_nightly_sync' );
}

// ====================================================================
// B. DB TABLE CREATION FUNCTION
// ====================================================================

function dk_calendar_create_db_table() {
    global $wpdb;
    require_once( ABSPATH . 'wp-admin/includes/upgrade.php' ); 

    $table_name = $wpdb->prefix . 'dk_course_cache';
    $charset_collate = $wpdb->get_charset_collate();

    // SQL Definition for the Course Cache Table
    $sql = "CREATE TABLE $table_name (
        instance_id BIGINT(20) NOT NULL,
        course_id BIGINT(20) NOT NULL,
        course_code VARCHAR(50) NOT NULL,
        course_name VARCHAR(255) NOT NULL,
        instance_name VARCHAR(255) NOT NULL,
        location VARCHAR(100) NOT NULL,
        is_public TINYINT(1) NOT NULL DEFAULT 0,
        enrolment_open TINYINT(1) NOT NULL DEFAULT 0,
        training_category VARCHAR(255) NOT NULL,
        duration VARCHAR(50) NOT NULL,
        state VARCHAR(10) NOT NULL,
        status VARCHAR(50) NOT NULL,
        start_date DATE NOT NULL,
        start_time TIME NOT NULL,
        finish_date DATETIME NOT NULL,
        max_participants INT(11) NOT NULL DEFAULT 0,
        vacancy INT(11) NOT NULL DEFAULT 0,
        cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        last_updated DATETIME NOT NULL,
        PRIMARY KEY (instance_id),
        KEY start_date (start_date),
        KEY location (location),
        KEY course_code (course_code)
    ) $charset_collate;";

    dbDelta( $sql );
}

// ====================================================================
// C. REGISTER SETTINGS AND HELPERS (MODIFIED)
// ====================================================================

add_action( 'admin_init', 'dk_calendar_register_settings' );

function dk_calendar_register_settings() {
    // --- 1. Register Options ---
    register_setting( 'dk_calendar_settings', 'dk_api_wstoken', 'sanitize_text_field' );
    register_setting( 'dk_calendar_settings', 'dk_api_apitoken', 'sanitize_text_field' );
    register_setting( 'dk_calendar_settings', 'dk_api_display_length', 'absint' ); 
    register_setting( 'dk_calendar_settings', 'dk_frontend_course_id', 'sanitize_text_field' );
    register_setting( 'dk_calendar_settings', 'dk_frontend_location_id', 'sanitize_text_field' );
    register_setting( 'dk_calendar_settings', 'dk_frontend_js_function', 'sanitize_text_field' );
    register_setting( 'dk_calendar_settings', 'dk_webhook_private_key', 'sanitize_text_field' ); 
    register_setting( 'dk_calendar_settings', 'dk_enrol_page_slug', 'sanitize_text_field' ); 
    register_setting( 'dk_calendar_settings', 'dk_webhook_log', 'wp_kses_post' ); 
    register_setting( 'dk_calendar_settings', 'dk_last_full_sync', 'sanitize_text_field' );
    register_setting( 'dk_calendar_settings', 'dk_cron_secret_key', 'sanitize_text_field' );
    
    // --- NEW: Enrolment Step Titles ---
    register_setting( 'dk_calendar_settings', 'dk_enrol_step_1_title', 'sanitize_text_field' );
    register_setting( 'dk_calendar_settings', 'dk_enrol_step_2_title', 'sanitize_text_field' );
    register_setting( 'dk_calendar_settings', 'dk_enrol_step_3_title', 'sanitize_text_field' );
    
    // --- Booking Rules ---
    register_setting( 'dk_calendar_settings', 'dk_min_booking_hours', 'absint' );

    // --- 2. API Credentials Section ---
    add_settings_section(
        'dk_api_credentials_section', 
        'Axcelerate API & Webhook Settings', 
        'dk_api_credentials_section_callback', 
        'dk-course-calendar' 
    );
    
    dk_add_api_field( 'wstoken', 'Axcelerate WS Token', 'dk_api_wstoken' );
    dk_add_api_field( 'apitoken', 'Axcelerate API Token', 'dk_api_apitoken' );
    dk_add_api_field( 'display_length', 'API Display Length (e.g., 4800)', 'dk_api_display_length' );

    // --- 3. Webhook Security Section ---
    add_settings_section(
        'dk_webhook_security_section', 
        'Webhook Security', 
        'dk_webhook_security_section_callback', 
        'dk-course-calendar' 
    );

    add_settings_field(
        'webhook_private_key', 
        'Webhook Private Key (for signature verification)', 
        'dk_render_text_field', 
        'dk-course-calendar', 
        'dk_webhook_security_section', 
        array( 
            'label_for' => 'dk_webhook_private_key',
            'option_name' => 'dk_webhook_private_key' 
        )
    );
    
    add_settings_field(
        'cron_secret_key', 
        'Cron Secret Key (for external cron endpoint)', 
        'dk_render_text_field', 
        'dk-course-calendar', 
        'dk_webhook_security_section', 
        array( 
            'label_for' => 'dk_cron_secret_key',
            'option_name' => 'dk_cron_secret_key' 
        )
    );
    
    // --- 4. Frontend Settings Section ---
    add_settings_section(
        'dk_frontend_section', 
        'Frontend JavaScript Settings', 
        'dk_frontend_section_callback', 
        'dk-course-calendar' 
    );
    
    dk_add_api_field( 'course_id', 'Course Dropdown ID (e.g., dk_courses)', 'dk_frontend_course_id' );
    dk_add_api_field( 'location_id', 'Location Dropdown ID (e.g., dk_locations)', 'dk_frontend_location_id' );
    dk_add_api_field( 'js_function', 'JS Function Name (e.g., dk_dostep1)', 'dk_frontend_js_function' );
    dk_add_api_field( 'enrol_page_slug', 'Enrolment Page Slug (e.g., course-enrol-group)', 'dk_enrol_page_slug' ); 
    
    // --- NEW: Enrolment Tab Titles Section ---
    add_settings_section(
        'dk_enrolment_titles_section', 
        'Enrolment Flow Step Titles', 
        'dk_enrolment_titles_section_callback', 
        'dk-course-calendar' 
    );
    
    dk_add_enrolment_title_field( 'step_1_title', 'Step 1 Title', 'dk_enrol_step_1_title' );
    dk_add_enrolment_title_field( 'step_2_title', 'Step 2 Title', 'dk_enrol_step_2_title' );
    dk_add_enrolment_title_field( 'step_3_title', 'Step 3 Title', 'dk_enrol_step_3_title' );
    
    // --- Booking Rules Section ---
    add_settings_section(
        'dk_booking_rules_section', 
        'Booking Rules', 
        'dk_booking_rules_section_callback', 
        'dk-course-calendar' 
    );
    
    add_settings_field(
        'min_booking_hours', 
        'Minimum Hours Before Workshop Start', 
        'dk_render_min_hours_field', 
        'dk-course-calendar', 
        'dk_booking_rules_section', 
        array( 
            'label_for' => 'dk_min_booking_hours',
            'option_name' => 'dk_min_booking_hours' 
        )
    );
}

// Section intro text callbacks
function dk_api_credentials_section_callback() {
    echo '<p>Enter your required tokens and API limits for the nightly data sync.</p>';
}
function dk_webhook_security_section_callback() {
    echo '<p>If using signed payloads, enter the private key configured in Axcelerate. This ensures webhooks are genuine.</p>';
}
function dk_frontend_section_callback() {
    echo '<p>Enter the HTML IDs and JavaScript function name used for the course filter controls.</p>';
}
function dk_enrolment_titles_section_callback() {
    echo '<p>Set the display titles for the three steps in the enrolment flow.</p>';
}
function dk_booking_rules_section_callback() {
    echo '<p>Configure booking restrictions to prevent last-minute course enrollments.</p>';
}

// Helper function to add a settings field and ensure consistent rendering
function dk_add_api_field( $id, $title, $option_name ) {
    $section_id = ( strpos( $option_name, 'webhook' ) !== false ) 
        ? 'dk_webhook_security_section' 
        : ( ( strpos( $option_name, 'frontend' ) !== false ) ? 'dk_frontend_section' : 'dk_api_credentials_section' );

    add_settings_field(
        $id, 
        $title, 
        'dk_render_text_field', 
        'dk-course-calendar', 
        $section_id, 
        array( 
            'label_for' => $option_name,
            'option_name' => $option_name 
        )
    );
}
// New helper function for cleaner settings registration
function dk_add_enrolment_title_field( $id, $title, $option_name ) {
    add_settings_field(
        $id, 
        $title, 
        'dk_render_text_field', 
        'dk-course-calendar', 
        'dk_enrolment_titles_section', 
        array( 
            'label_for' => $option_name,
            'option_name' => $option_name 
        )
    );
}

// Generic callback function to render a standard text input field
function dk_render_text_field( $args ) {
    $option = get_option( $args['option_name'] );
    $type = ( strpos( $args['option_name'], 'token' ) !== false || strpos( $args['option_name'], 'key' ) !== false ) ? 'password' : 'text'; 

    echo '<input type="' . esc_attr($type) . '" 
                id="' . esc_attr( $args['option_name'] ) . '" 
                name="' . esc_attr( $args['option_name'] ) . '" 
                value="' . esc_attr( $option ) . '" 
                class="regular-text">';
}

// Render minimum booking hours field with description
function dk_render_min_hours_field( $args ) {
    $option = get_option( $args['option_name'], 6 ); // Default 6 hours
    echo '<input type="number" 
                id="' . esc_attr( $args['option_name'] ) . '" 
                name="' . esc_attr( $args['option_name'] ) . '" 
                value="' . esc_attr( $option ) . '" 
                min="0" 
                max="168" 
                class="small-text"> hours';
    echo '<p class="description">Students must book at least this many hours before the workshop starts. Set to 0 to disable. Default: 6 hours.</p>';
}

// ====================================================================
// D. ADMIN MENU PAGE AND TAB ROUTING
// ====================================================================

add_action( 'admin_menu', 'dk_calendar_add_admin_menu' );

function dk_calendar_add_admin_menu() {
    add_menu_page(
        'Course Calendar Settings', 
        'DK Calendar', 
        'manage_options', 
        'dk-course-calendar', 
        'dk_calendar_settings_page_router', 
        'dashicons-calendar-alt', 
        25 
    );
}

function dk_calendar_settings_page_router() {
    if ( ! current_user_can( 'manage_options' ) ) {
        return;
    }

    // --- CHECK AND DISPLAY ERROR TRANSIENT ---
    $sync_error = get_transient( 'dk_calendar_sync_error' );
    if ( $sync_error ) {
        echo '<div class="notice notice-error is-dismissible"><p><strong>SYNC FAILED:</strong> ' . esc_html($sync_error) . '</p></div>';
        delete_transient( 'dk_calendar_sync_error' );
    }
    // --- END ERROR CHECK ---

    $current_tab = isset( $_GET['tab'] ) ? sanitize_text_field( $_GET['tab'] ) : 'settings';

    echo '<div class="wrap">';
    echo '<h1>' . esc_html( get_admin_page_title() ) . '</h1>';
    
    // Display tabs
    echo '<h2 class="nav-tab-wrapper">';
    echo '<a href="?page=dk-course-calendar&tab=settings" class="nav-tab ' . ($current_tab == 'settings' ? 'nav-tab-active' : '') . '">Settings</a>';
    echo '<a href="?page=dk-course-calendar&tab=review" class="nav-tab ' . ($current_tab == 'review' ? 'nav-tab-active' : '') . '">Data Review</a>';
    echo '</h2>';

    // Route to the correct tab content
    if ( $current_tab == 'settings' ) {
        dk_calendar_render_settings_tab();
    } elseif ( $current_tab == 'review' ) {
        dk_calendar_render_review_tab();
    }
    
    echo '</div>';
}

function dk_calendar_render_settings_tab() {
    global $wpdb;
    $table_name = $wpdb->prefix . 'dk_course_cache';

    // Check for success message from the manual sync
    if ( isset( $_GET['sync_status'] ) && $_GET['sync_status'] == 'success' ) {
        echo '<div class="notice notice-success is-dismissible"><p><strong>Data sync completed!</strong> Check your course calendar data now.</p></div>';
    }

    // Check for reschedule success
    if ( isset( $_GET['reschedule_status'] ) && $_GET['reschedule_status'] == 'success' ) {
        $res_ts = isset( $_GET['reschedule_ts'] ) ? sanitize_text_field( $_GET['reschedule_ts'] ) : '';
        echo '<div class="notice notice-success is-dismissible"><p><strong>Nightly sync rescheduled.</strong> Next run: ' . esc_html( $res_ts ) . '.</p></div>';
    }

    // Retrieve last sync timestamp
    $last_sync_timestamp = get_option( 'dk_last_full_sync' );
    $last_sync_message = 'Never run.';
    if ($last_sync_timestamp) {
        $last_sync_message = 'Last full sync: ' . date( 'Y-m-d H:i:s', strtotime( $last_sync_timestamp ) ) . ' (Local Time)';
    }

    // --- DEBUG CHECK ---
    $row_count = $wpdb->get_var( "SELECT COUNT(*) FROM $table_name" );
    if ( $row_count > 0 ) {
         echo '<div class="notice notice-success"><p>✅ **Database Check:** Found **' . absint($row_count) . ' course instances** in the local cache. The data is present! (' . esc_html($last_sync_message) . ')</p></div>';
    } else {
        echo '<div class="notice notice-error"><p>❌ **Database Check:** Found **0 course instances** in the local cache. The sync likely failed or tokens are invalid. (' . esc_html($last_sync_message) . ')</p></div>';
    }
    // --- END DEBUG CHECK ---

    $manual_sync_url = wp_nonce_url( admin_url( 'admin.php?action=dk_manual_sync' ), 'dk_manual_sync_action' );
    
    ?>
    <form action="options.php" method="post">
        <?php
        settings_fields( 'dk_calendar_settings' );
        do_settings_sections( 'dk-course-calendar' );
        submit_button( 'Save Settings' );
        ?>
    </form>
    <?php
    // --- CRON DIAGNOSTICS ---
    $next_sched = wp_next_scheduled( 'dk_calendar_nightly_sync' );
    $cron_disabled = defined( 'DISABLE_WP_CRON' ) && DISABLE_WP_CRON;

    echo '<h3>Cron Diagnostics</h3>';
    if ( $cron_disabled ) {
        echo '<p style="color:orange;"><strong>WP-Cron is disabled (DISABLE_WP_CRON = true).</strong> Scheduled events will not run automatically.</p>';
    }

    if ( $next_sched ) {
        echo '<p>Next scheduled DK nightly sync: ' . esc_html( date( 'Y-m-d H:i:s', $next_sched ) ) . ' (server time)</p>';
    } else {
        echo '<p style="color:red;"><strong>No scheduled DK nightly sync event found.</strong> The nightly sync will not run unless triggered manually.</p>';
    }

    echo '<p>To test now: click the <em>Run Full Data Sync Now</em> button below or run via WP-CLI: <code>wp cron event run --due-now dk_calendar_nightly_sync</code></p>';
    // --- END CRON DIAGNOSTICS ---
    ?>
    <?php
    // Reschedule button (schedules next run at next midnight)
    $reschedule_url = wp_nonce_url( admin_url( 'admin.php?action=dk_reschedule_nightly_sync' ), 'dk_reschedule_nightly_sync_action' );
    echo '<p><a href="' . esc_url( $reschedule_url ) . '" class="button">Schedule nightly sync for next midnight</a></p>';
    ?>
    
    <hr/>
    
    <h2>Manual Data Synchronization</h2>
    <p>Use this button to immediately run the full 3-month API sync for testing purposes.</p>
    <a href="<?php echo esc_url($manual_sync_url); ?>" class="button button-primary">Run Full Data Sync Now</a>
    
    <h3 style="margin-top: 30px;">Webhook Listener URL</h3>
    <p>This is the URL you must paste into the **Axcelerate Webhooks configuration** area. It is automatically adjusted for your staging environment (`/developer`).</p>
    <p><strong><?php echo esc_url( get_rest_url( null, 'dk-calendar/v1/webhook' ) ); ?></strong></p>
    <?php
}

function dk_calendar_render_review_tab() {
    global $wpdb;
    $table_name = $wpdb->prefix . 'dk_course_cache';
    
    // Fetch the first 50 records, ordered by date
    $data = $wpdb->get_results( "SELECT * FROM $table_name ORDER BY start_date ASC, start_time ASC LIMIT 50", ARRAY_A );
    
    echo '<h2>Cached Course Data (Showing First 50 Records)</h2>';
    
    if ( empty( $data ) ) {
        echo '<p>No data found in the local course cache table. Run the manual synchronization first.</p>';
        return;
    }
    
    echo '<table class="wp-list-table widefat fixed striped">';
    echo '<thead><tr>';
    
    // Generate headers from the first row keys
    $headers = array_keys( $data[0] );
    foreach ($headers as $header) {
        echo '<th>' . esc_html( strtoupper($header) ) . '</th>';
    }
    echo '</tr></thead>';
    
    echo '<tbody>';
    foreach ($data as $row) {
        echo '<tr>';
        foreach ($row as $value) {
            echo '<td>' . esc_html($value) . '</td>';
        }
        echo '</tr>';
    }
    echo '</tbody>';
    echo '</table>';
    
    // --- WEBHOOK LOG VIEWER ---
    echo '<h2>Webhook Payload History (Last 10 Events)</h2>';
    $webhook_log = get_option('dk_webhook_log', []);
    
    if (empty($webhook_log)) {
        echo '<p>No webhooks have been received yet.</p>';
        return;
    }
    
    echo '<table class="wp-list-table widefat fixed striped">';
    echo '<thead><tr><th>Time (UTC)</th><th>Event Type</th><th>Payload Snippet</th></tr></thead>';
    echo '<tbody>';
    
    foreach ($webhook_log as $entry) {
        $payload_display = substr(json_encode(json_decode($entry['payload']), JSON_PRETTY_PRINT), 0, 500) . '...';
        
        echo '<tr>';
        echo '<td>' . esc_html($entry['timestamp']) . '</td>';
        echo '<td>' . esc_html($entry['type']) . '</td>';
        echo '<td><pre style="white-space: pre-wrap; word-break: break-all; margin: 0; font-size: 0.8em; max-height: 200px; overflow: auto;">' . esc_html($payload_display) . '</pre></td>';
        echo '</tr>';
    }
    
    echo '</tbody>';
    echo '</table>';
    // --- END WEBHOOK LOG VIEWER ---
}

// ====================================================================
// D2. EXTERNAL CRON ENDPOINT FOR MANUAL SYNC
// ====================================================================

/**
 * AJAX handler for external cron service to trigger sync
 * URL: https://yourdomain.com/wp-admin/admin-ajax.php?action=dk_manual_sync&key=YOUR_SECRET_KEY
 */
function dk_ajax_manual_sync() {
    // Get the secret key from settings
    $stored_key = get_option( 'dk_cron_secret_key' );
    
    // Get the key from the request
    $provided_key = isset( $_GET['key'] ) ? sanitize_text_field( $_GET['key'] ) : '';
    
    // Validate the key
    if ( empty( $stored_key ) ) {
        status_header( 500 );
        wp_send_json_error( array( 'message' => 'Cron secret key not configured in settings' ) );
        exit;
    }
    
    if ( empty( $provided_key ) || $provided_key !== $stored_key ) {
        status_header( 403 );
        wp_send_json_error( array( 'message' => 'Invalid or missing secret key' ) );
        exit;
    }
    
    // Key is valid, run the sync
    error_log( 'DK Manual Sync: Starting sync triggered by external cron' );
    dk_calendar_perform_sync();
    
    // Check if sync was successful
    $sync_error = get_transient( 'dk_calendar_sync_error' );
    if ( $sync_error ) {
        status_header( 500 );
        wp_send_json_error( array( 'message' => 'Sync failed', 'error' => $sync_error ) );
    } else {
        $last_sync = get_option( 'dk_last_full_sync', 'Never' );
        wp_send_json_success( array( 
            'message' => 'Sync completed successfully', 
            'last_sync' => $last_sync 
        ) );
    }
    exit;
}

// ====================================================================
// E. THE MAIN SYNCHRONIZATION FUNCTION (API PULL)
// ====================================================================

function dk_calendar_perform_sync() {
    global $wpdb;
    $table_name = $wpdb->prefix . 'dk_course_cache';

    // Helper function to report errors back to the Admin Settings page
    $report_error = function($message, $raw_body = '') {
        $full_message = 'DK Sync Error: ' . $message;
        if (!empty($raw_body)) {
            $full_message .= '. Raw response snippet: ' . substr($raw_body, 0, 500);
        }
        error_log($full_message); 
        set_transient( 'dk_calendar_sync_error', $full_message, 60 * 60 ); 
    };

    // 1. Get required settings
    $wstoken = get_option( 'dk_api_wstoken' );
    $apitoken = get_option( 'dk_api_apitoken' );
    $display_length = get_option( 'dk_api_display_length', 4800 ); 
    
    if ( empty( $wstoken ) || empty( $apitoken ) ) {
        $report_error( 'Axcelerate API tokens are not configured.' );
        return; 
    }

    // Clear any previous error message
    delete_transient( 'dk_calendar_sync_error' );

    // 2. Clear the existing table for a full refresh
    $wpdb->query( "TRUNCATE TABLE $table_name" );
    
    $month_count = 3; 
    $base_url = 'https://lifesavingfirstaid.app.axcelerate.com/api/course/instance/search?type=w&displayLength=' . absint( $display_length );
    $all_courses_synced = array(); 

    // 3. Loop through the next $month_count months
    for ( $i = 0; $i < $month_count; $i++ ) {
        
        $start_date_obj = new DateTime( "first day of +$i month" );
        $end_date_obj = new DateTime( "last day of +$i month" );
        
        $start_date = $start_date_obj->format( 'Y-m-d' );
        $end_date = $end_date_obj->format( 'Y-m-t' ); 
        
        $api_url = $base_url . '&startDate_min=' . $start_date . '&startDate_max=' . $end_date;

        // 4. Set headers
        $headers = array(
            'wstoken'  => $wstoken,
            'apitoken' => $apitoken,
            'Content-Type' => 'application/json'
        );

        // 5. Make the API request using POST
        $response = wp_remote_post( $api_url, array(
            'headers' => $headers,
            'timeout' => 45 
        ) );

        if ( is_wp_error( $response ) ) {
            $report_error( 'API Request failed with WP_Error. Message: ' . $response->get_error_message() );
            continue;
        }

        // --- Check HTTP Status Code ---
        $response_code = wp_remote_retrieve_response_code( $response );
        $body = wp_remote_retrieve_body( $response );

        if ( $response_code !== 200 ) {
            $report_error( 'API Request returned HTTP code ' . $response_code . '.', $body );
            continue;
        }
        // --- End Check ---

        $data = json_decode( $body, true );
        
        if ( ! is_array( $data ) || empty( $data ) ) {
            $report_error( 'Invalid or empty JSON response received for month ' . $start_date . '.', $body );
            continue;
        }

        // 6. Process and collect data
        foreach ( $data as $course ) {
            if ( ! isset($course['INSTANCEID']) || empty($course['INSTANCEID']) ) {
                error_log( 'DK Calendar Sync Error: Skipping malformed course record without INSTANCEID. Data: ' . print_r($course, true) );
                continue;
            }
            
            $start_datetime = new DateTime( $course['STARTDATE'] );

            $all_courses_synced[] = array(
                'instance_id' => intval( $course['INSTANCEID'] ),
                'course_id' => intval( $course['ID'] ),
                'course_code' => sanitize_text_field( $course['CODE'] ),
                'course_name' => sanitize_text_field( $course['COURSENAME'] ),
                'instance_name' => sanitize_text_field( $course['NAME'] ),
                'location' => sanitize_text_field( $course['LOCATION'] ),
                'is_public' => isset( $course['PUBLIC'] ) ? (int)$course['PUBLIC'] : 0, 
                'enrolment_open' => isset( $course['ENROLMENTOPEN'] ) ? (int)$course['ENROLMENTOPEN'] : 0,
                'training_category' => sanitize_text_field( $course['TRAININGCATEGORY'] ),
                'duration' => sanitize_text_field( $course['DURATION'] ),
                'state' => sanitize_text_field( $course['STATE'] ),
                'status' => sanitize_text_field( $course['STATUS'] ),
                'start_date' => $start_datetime->format( 'Y-m-d' ),
                'start_time' => $start_datetime->format( 'H:i:s' ),
                'finish_date' => $course['FINISHDATE'],
                'max_participants' => intval( $course['MAXPARTICIPANTS'] ),
                'vacancy' => intval( $course['PARTICIPANTVACANCY'] ),
                'cost' => floatval( $course['COST'] ),
                'last_updated' => current_time( 'mysql' ), 
            );
        }
    }
    
    // 7. Insert all collected data
    foreach ( $all_courses_synced as $course_data ) {
        $wpdb->insert( $table_name, $course_data );
    }

    // Update last sync time
    update_option( 'dk_last_full_sync', current_time( 'mysql' ) );

    error_log( 'DK Calendar Sync: Successfully synced ' . count( $all_courses_synced ) . ' course instances.' );
}

// ====================================================================
// F. REGISTER CUSTOM REST ROUTE (WEBHOOK LISTENER)
// ====================================================================

add_action( 'rest_api_init', 'dk_calendar_register_webhook_route' );

function dk_calendar_register_webhook_route() {
    register_rest_route( 'dk-calendar/v1', '/webhook', array(
        'methods' => 'POST', 
        'callback' => 'dk_calendar_handle_webhook', 
        'permission_callback' => '__return_true', 
    ) );
}

// ====================================================================
// G. WEBHOOK HANDLER AND SIGNATURE VERIFICATION
// ====================================================================

function dk_calendar_handle_webhook( $request ) {
    $raw_payload = $request->get_body();
    
    // --- TEMPORARY LOGGING: Save the raw payload to the option ---
    $log_entry = [
        'timestamp' => current_time('mysql'),
        'type' => $request->get_param('type') ?? 'UNKNOWN',
        'payload' => $raw_payload
    ];
    $existing_log = get_option('dk_webhook_log', []);
    if (!is_array($existing_log)) $existing_log = [];
    
    array_unshift($existing_log, $log_entry);
    $new_log = array_slice($existing_log, 0, 10);
    
    update_option('dk_webhook_log', $new_log, 'no');
    // --- END TEMPORARY LOGGING ---
    
    $signature = $request->get_header( 'Ax-Signature' );
    $signature_version = $request->get_header( 'Ax-Signature-Version' );
    $private_key = get_option( 'dk_webhook_private_key' );

    // --- SECURITY CHECK ---
    if ( ! empty( $private_key ) && $signature_version === '1' ) {
        $expected_signature = hash_hmac( 'sha256', $raw_payload, $private_key );

        if ( hash_equals( $expected_signature, $signature ) === false ) {
            error_log( 'DK Webhook Error: Signature mismatch. Request denied.' );
            return new WP_REST_Response( array( 'message' => 'Signature verification failed.' ), 401 );
        }
    }
    // --- END SECURITY CHECK ---

    $data = json_decode( $raw_payload, true );

    $event_type = $data['type'] ?? '';
    $instance_id = intval( $data['message']['enrolment']['workshop']['id'] ?? 0 );

    // Define the events we want to act on
    $monitored_events = [
        'student.workshop_enrolment_created', 
        'student.workshop_enrolment_deleted', 
        'student.workshop_enrolment_status_changed'
    ];

    // Check if event is monitored and has valid instance ID
    if ( ! in_array( $event_type, $monitored_events ) || $instance_id === 0 ) {
         error_log( 'DK Webhook: Missing instance ID for workshop event: ' . $event_type );
         return new WP_REST_Response( array( 'message' => 'Invalid payload - missing instance ID.' ), 200 );
    }

    // Trigger the single instance sync to get the current definitive vacancy count
    $success = dk_sync_single_instance( $instance_id );
    
    if ( $success ) {
        return new WP_REST_Response( array( 'message' => 'Status change processed and data refreshed.' ), 200 );
    } else {
        error_log('DK Webhook Handler: Single sync failed for instance ID ' . $instance_id);
        return new WP_REST_Response( array( 'message' => 'Single sync failed.' ), 500 );
    }
}


// ====================================================================
// H.1. SINGLE INSTANCE SYNC FUNCTION 
// ====================================================================

function dk_sync_single_instance( $instance_id ) {
    global $wpdb;
    $table_name = $wpdb->prefix . 'dk_course_cache';

    $wstoken = get_option( 'dk_api_wstoken' );
    $apitoken = get_option( 'dk_api_apitoken' );
    $display_length = 1; 

    if ( empty( $wstoken ) || empty( $apitoken ) ) {
        error_log( 'DK Single Sync Error: API tokens are not configured.' );
        return false;
    }

    // Use instanceID filter to pull only one specific course instance
    $base_url = 'https://lifesavingfirstaid.app.axcelerate.com/api/course/instance/search?type=w&displayLength=' . $display_length . '&instanceID=' . absint($instance_id);

    $headers = array(
        'wstoken'  => $wstoken,
        'apitoken' => $apitoken,
        'Content-Type' => 'application/json'
    );

    $response = wp_remote_post( $base_url, array(
        'headers' => $headers,
        'timeout' => 15 
    ) );

    if ( is_wp_error( $response ) ) {
        error_log( 'DK Single Sync Error: WP_Error: ' . $response->get_error_message() );
        return false;
    }

    $response_code = wp_remote_retrieve_response_code( $response );
    $body = wp_remote_retrieve_body( $response );

    if ( $response_code !== 200 ) {
        error_log( 'DK Single Sync Error: HTTP code ' . $response_code . '. Body: ' . substr($body, 0, 200) );
        return false;
    }

    $data = json_decode( $body, true );
    
    if ( ! is_array( $data ) || empty($data) || ! isset($data[0]['INSTANCEID']) ) {
        error_log( 'DK Single Sync Error: Response body missing course data for ID ' . $instance_id );
        return false;
    }

    $course = $data[0];
    
    // --- Data Mapping ---
    $start_datetime = new DateTime( $course['STARTDATE'] );

    $course_data = array(
        'instance_id' => intval( $course['INSTANCEID'] ),
        'course_id' => intval( $course['ID'] ),
        'course_code' => sanitize_text_field( $course['CODE'] ),
        'course_name' => sanitize_text_field( $course['COURSENAME'] ),
        'instance_name' => sanitize_text_field( $course['NAME'] ),
        'location' => sanitize_text_field( $course['LOCATION'] ),
        'is_public' => isset( $course['PUBLIC'] ) ? (int)$course['PUBLIC'] : 0, 
        'enrolment_open' => isset( $course['ENROLMENTOPEN'] ) ? (int)$course['ENROLMENTOPEN'] : 0,
        'training_category' => sanitize_text_field( $course['TRAININGCATEGORY'] ),
        'duration' => sanitize_text_field( $course['DURATION'] ),
        'state' => sanitize_text_field( $course['STATE'] ),
        'status' => sanitize_text_field( $course['STATUS'] ),
        'start_date' => $start_datetime->format( 'Y-m-d' ),
        'start_time' => $start_datetime->format( 'H:i:s' ),
        'finish_date' => $course['FINISHDATE'],
        'max_participants' => intval( $course['MAXPARTICIPANTS'] ),
        'vacancy' => intval( $course['PARTICIPANTVACANCY'] ),
        'cost' => floatval( $course['COST'] ),
        'last_updated' => current_time( 'mysql' ), 
    );
    
    $result = $wpdb->replace( $table_name, $course_data ); 

    if ( $result === false ) {
        error_log( 'DK Single Sync DB Error: Failed to replace instance_id ' . $instance_id );
        return false;
    }
    
    error_log( 'DK Single Sync: Successfully updated instance ID ' . $instance_id . ' with current vacancy: ' . $course_data['vacancy'] );
    return true;
}

// ====================================================================
// I. MANUAL SYNC TRIGGER
// ====================================================================

add_action( 'admin_action_dk_manual_sync', 'dk_handle_manual_sync' );

function dk_handle_manual_sync() {
    // Check nonces and user capabilities for security
    if ( ! current_user_can( 'manage_options' ) || ! isset( $_GET['_wpnonce'] ) || ! wp_verify_nonce( $_GET['_wpnonce'], 'dk_manual_sync_action' ) ) {
        wp_die( 'Security check failed.' );
    }

    // Call the main sync function directly
    dk_calendar_perform_sync();

    // Redirect back to the settings page with a success message
    $redirect_url = add_query_arg( array(
        'page' => 'dk-course-calendar',
        'sync_status' => 'success',
        'tab' => 'settings'
    ), admin_url( 'admin.php' ) );

    wp_safe_redirect( $redirect_url );
    exit;
}

// ====================================================================
// J. SHORTCODE REGISTRATION AND ASSET LOADING (MODIFIED)
// ====================================================================

add_shortcode( 'dk_calendar', 'dk_calendar_shortcode_output' );
add_action( 'wp_enqueue_scripts', 'dk_calendar_enqueue_assets' );

// This function checks for the shortcode and enqueues scripts/styles
function dk_calendar_enqueue_assets() {
    global $post;
    
    // Check if the shortcode is present on the page, including the new enrolment one
    if ( is_a( $post, 'WP_Post' ) && ( has_shortcode( $post->post_content, 'dk_calendar' ) || has_shortcode( $post->post_content, 'dk_enrolment_flow' ) ) ) {
        
        // --- 1. Register and Enqueue Styles ---
        wp_register_style( 'dk-calendar-style', plugins_url( 'assets/css/dk-calendar.css', DK_CALENDAR_FILE ), array(), '1.0.2' ); 
        wp_enqueue_style( 'dk-calendar-style' );
        
        // --- NEW: Register and Enqueue Enrolment Styles ---
        wp_register_style( 'dk-enrolment-style', plugins_url( 'assets/css/dk-enrolment.css', DK_CALENDAR_FILE ), array(), '1.0.0' ); 
        wp_enqueue_style( 'dk-enrolment-style' );
        
        // --- 2. Register and Enqueue Scripts ---
        wp_enqueue_script( 'jquery' ); 
        
        wp_register_script( 'dk-calendar-script', plugins_url( 'assets/js/dk-calendar.js', DK_CALENDAR_FILE ), array('jquery'), '1.0.2', true ); 
        wp_enqueue_script( 'dk-calendar-script' );

        // --- NEW: Register and Enqueue Enrolment Scripts ---
        wp_register_script( 'dk-enrolment-script', plugins_url( 'assets/js/dk-enrolment.js', DK_CALENDAR_FILE ), array('jquery'), '1.0.0', true ); 
        wp_enqueue_script( 'dk-enrolment-script' );
        
        // --- 3. Localize Script (Pass PHP variables to JavaScript) ---
        // AGGRESSIVE FILTER: Strip malformed parameter names and values
        $clean_filters = array();
        
        // Only process parameters with clean, expected names
        $allowed_params = array('c_id', 'l_name', 'd_from', 'd_to');
        foreach ($allowed_params as $param) {
            if (isset($_GET[$param]) && is_string($_GET[$param])) {
                $value = sanitize_text_field($_GET[$param]);
                // Only include non-empty values that don't contain 'http'
                if (!empty($value) && strpos($value, 'http') === false && strpos($value, '://') === false) {
                    $clean_filters[$param] = $value;
                } elseif ($param === 'd_from' || $param === 'd_to') {
                    // Always include date params even if empty (will default later)
                    $clean_filters[$param] = $value;
                }
            }
        }
        
        $js_data = array(
            'ajax_url' => admin_url( 'admin-ajax.php' ),
            'course_id_selector' => get_option( 'dk_frontend_course_id' ),
            'location_id_selector' => get_option( 'dk_frontend_location_id' ),
            'js_function_name' => get_option( 'dk_frontend_js_function' ),
            'enrol_page_slug' => get_option( 'dk_enrol_page_slug' ),
            'current_filters' => $clean_filters
        );
        wp_localize_script( 'dk-calendar-script', 'DKCalendarData', $js_data );
        
        // --- NEW: Localize Enrolment Script (Pass URL data/settings) ---
        $enrolment_data = array(
            'ajax_url' => admin_url( 'admin-ajax.php' ),
            'messages' => [
                'final_check' => 'Have you added all the students you wish to book into this course?',
                'validation_error' => 'Please fill in all required fields and agree to the terms.'
            ],
            // Use existing plugin settings for step names, as requested
            'step_names' => [
                get_option('dk_enrol_step_1_title', 'Student Details'),
                get_option('dk_enrol_step_2_title', 'Payment'),
                get_option('dk_enrol_step_3_title', 'Enrolment Complete')
            ]
        );
        wp_localize_script( 'dk-enrolment-script', 'DKEnrolmentData', $enrolment_data );
    }
}

// ====================================================================
// K. SHORTCODE PLACEHOLDER AND AJAX HANDLER REGISTRATION
// ====================================================================

// Shortcode only renders the placeholder HTML for the spinner
function dk_calendar_shortcode_output( $atts ) {
    $atts = shortcode_atts(
        array(
            'layout' => 'default', 
        ), $atts, 'dk_calendar'
    );
    $layout = sanitize_text_field($atts['layout']);
    
    ob_start(); 
    ?>
    <div id="dk-calendar-ajax-container" class="dk-layout-<?php echo esc_attr($layout); ?>">
        <div class="dk-loading-spinner-wrapper">
            <div class="dk-spinner"></div>
            <p>Calendar Generating from Available Course Data...</p>
        </div>
        </div>
    <?php
    return ob_get_clean();
}

// AJAX Handler to fetch and render the calendar content (Public and logged-in users)
add_action( 'wp_ajax_dk_render_calendar', 'dk_calendar_ajax_render' );
add_action( 'wp_ajax_nopriv_dk_render_calendar', 'dk_calendar_ajax_render' );

// The main processing logic (moved from the old shortcode function)
function dk_calendar_ajax_render() {
    global $wpdb;
    $table_name = $wpdb->prefix . 'dk_course_cache';

    // Get parameters from AJAX request
    $filters = array_map( 'sanitize_text_field', $_POST['filters'] ?? [] );
    $layout = sanitize_text_field( $_POST['layout'] ?? 'default' );

    // --- 1. Get Filters from AJAX Data (from URL) ---
    $filter_course = $filters['c_id'] ?? false;
    $filter_location = $filters['l_name'] ?? false;
    
    // Fallback to current month if d_from is missing
    $date_min = $filters['d_from'] ?? current_time( 'Y-m-01' );
    $current_month = new DateTime( $date_min );
    $date_max = $current_month->format( 'Y-m-t' ); 

    // --- 2. Construct the SQL Query (Filtered) ---
    $sql_where = array();
    $sql_args = array();

    $sql_where[] = 'start_date BETWEEN %s AND %s';
    $sql_args[] = $date_min;
    $sql_args[] = $date_max;

    if ( $filter_location && strtolower( $filter_location ) !== 'all locations' ) {
        $sql_where[] = 'location = %s';
        $sql_args[] = $filter_location;
    }

    if ( $filter_course && strtolower( $filter_course ) !== 'all courses' ) {
        $sql_where[] = '(course_code = %s OR course_id = %d)';
        $sql_args[] = $filter_course;
        $sql_args[] = intval( $filter_course );
    }

    $sql_where[] = 'vacancy > 0';
    $sql_where[] = 'is_public = 1';
    $sql_where[] = 'enrolment_open = 1';
    $sql_where[] = "status = 'Active'";
    
    // Add minimum booking hours filter
    $min_hours = intval( get_option( 'dk_min_booking_hours', 6 ) );
    if ( $min_hours > 0 ) {
        $cutoff_time = current_time( 'mysql' );
        $cutoff_datetime = new DateTime( $cutoff_time );
        $cutoff_datetime->modify( '+' . $min_hours . ' hours' );
        $cutoff_formatted = $cutoff_datetime->format( 'Y-m-d H:i:s' );
        
        $sql_where[] = 'CONCAT(start_date, " ", start_time) >= %s';
        $sql_args[] = $cutoff_formatted;
    }

    $where_clause = count( $sql_where ) > 0 ? 'WHERE ' . implode( ' AND ', $sql_where ) : '';
    
    // Ensure all necessary enrollment data is selected
    $sql = "SELECT start_date, finish_date, instance_id, course_id, instance_name, course_code, course_name, location, cost, vacancy, start_time
            FROM $table_name 
            $where_clause 
            ORDER BY start_date ASC, start_time ASC";

    $prepared_sql = $wpdb->prepare( $sql, $sql_args );
    $courses = $wpdb->get_results( $prepared_sql, ARRAY_A );
    
    $courses_by_day = array();
    foreach ( $courses as $course ) {
        // Ensure vacancy is a raw integer when sent to the frontend
        if ( isset( $course['vacancy'] ) ) {
            $course['vacancy'] = intval( $course['vacancy'] );
        } else {
            $course['vacancy'] = 0;
        }

        $day = (new DateTime( $course['start_date'] ))->format('j');
        $courses_by_day[$day][] = $course;
    }

    // --- 3. Calculate Navigation Dates ---
    $prev_month = (new DateTime( $date_min ))->modify('-1 month')->format('Y-m-01');
    $next_month = (new DateTime( $date_min ))->modify('+1 month')->format('Y-m-01');
    
    // Function to rebuild URL with new month while preserving other filters
    $rebuild_url = function($new_date) use ($filter_course, $filter_location) {
        $args = array(
            'd_from' => $new_date,
            'd_to' => (new DateTime($new_date))->format('Y-m-t')
        );
        // Only add filter params if they have valid, clean values
        if (!empty($filter_course) && is_string($filter_course) && strpos($filter_course, 'http') === false) {
            $args['c_id'] = $filter_course;
        }
        if (!empty($filter_location) && is_string($filter_location) && strpos($filter_location, 'http') === false) {
            $args['l_name'] = $filter_location;
        }
        
        return http_build_query($args);
    };

    // --- 4. Render the Calendar HTML (Output sent back via JSON) ---
    
    $prev_query = $rebuild_url($prev_month);
    $next_query = $rebuild_url($next_month);
    
    ob_start();
    ?>
    <div id="dk-calendar-content">
        <div class="dk-calendar-header">
            <a href="?<?php echo esc_attr($prev_query); ?>" class="dk-nav-btn dk-prev-month">&lt; Previous Month</a>
            <h2><?php echo esc_html( $current_month->format('F Y') ); ?></h2>
            <a href="?<?php echo esc_attr($next_query); ?>" class="dk-nav-btn dk-next-month">Next Month &gt;</a>
        </div>
        
        <div class="dk-content-container"> 
            
            <div class="dk-calendar-grid">
                <div class="dk-day-name">Sun</div>
                <div class="dk-day-name">Mon</div>
                <div class="dk-day-name">Tue</div>
                <div class="dk-day-name">Wed</div>
                <div class="dk-day-name">Thu</div>
                <div class="dk-day-name">Fri</div>
                <div class="dk-day-name">Sat</div>
                
                <?php
                $start_day_of_week = intval( $current_month->format('w') ); 
                $days_in_month = intval( $current_month->format('t') );
                
                for ($i = 0; $i < $start_day_of_week; $i++) {
                    echo '<div class="dk-day dk-empty"></div>';
                }
                
                for ($day_num = 1; $day_num <= $days_in_month; $day_num++) {
                    $has_courses = isset($courses_by_day[$day_num]);
                    $classes = 'dk-day';
                    if ($has_courses) {
                        $classes .= ' dk-has-courses';
                    }
                    
                    $data_courses = $has_courses ? json_encode($courses_by_day[$day_num]) : '';
                    
                    echo '<div class="' . esc_attr($classes) . '" data-day="' . $day_num . '" data-courses="' . esc_attr($data_courses) . '">';
                    echo '<div class="dk-date-number">' . $day_num . '</div>';
                    echo '</div>';
                }

                $total_cells = $start_day_of_week + $days_in_month;
                $trailing_cells = 42 - $total_cells;
                if ($trailing_cells > 0) {
                     for ($i = 0; $i < $trailing_cells; $i++) {
                        echo '<div class="dk-day dk-empty"></div>';
                    }
                }
                ?>
            </div>
            
            <div id="dk-course-details" class="dk-details-panel" data-layout="<?php echo esc_attr($layout); ?>" style="display:none;">
                </div>
            
        </div> </div>
    <?php
    $html_content = ob_get_clean();

    wp_send_json_success( array(
        'html' => $html_content,
        'has_courses' => !empty($courses) // Signal to JS if any courses were found
    ) );
    
    wp_die();
}

// Admin action: reschedule the nightly sync to the next midnight
add_action( 'admin_action_dk_reschedule_nightly_sync', 'dk_handle_reschedule_nightly_sync' );

function dk_handle_reschedule_nightly_sync() {
    // Security and capability checks
    if ( ! current_user_can( 'manage_options' ) || ! isset( $_GET['_wpnonce'] ) || ! wp_verify_nonce( $_GET['_wpnonce'], 'dk_reschedule_nightly_sync_action' ) ) {
        wp_die( 'Security check failed.' );
    }

    // Clear any existing scheduled occurrences for this hook
    if ( function_exists( 'wp_clear_scheduled_hook' ) ) {
        wp_clear_scheduled_hook( 'dk_calendar_nightly_sync' );
    } else {
        // Fallback: try to unschedule next occurrence
        $ts = wp_next_scheduled( 'dk_calendar_nightly_sync' );
        if ( $ts ) {
            wp_unschedule_event( $ts, 'dk_calendar_nightly_sync' );
        }
    }

    // Determine next midnight (server/site timezone aware using WP current_time)
    $now = current_time( 'timestamp' );
    $next_midnight = strtotime( 'tomorrow midnight', $now );
    if ( $next_midnight <= $now ) {
        $next_midnight = $next_midnight + DAY_IN_SECONDS;
    }

    // Schedule a daily event starting at next midnight
    wp_schedule_event( $next_midnight, 'daily', 'dk_calendar_nightly_sync' );

    // Redirect back to settings with a success message
    $redirect_url = add_query_arg( array(
        'page' => 'dk-course-calendar',
        'tab' => 'settings',
        'reschedule_status' => 'success',
        'reschedule_ts' => date( 'Y-m-d H:i:s', $next_midnight )
    ), admin_url( 'admin.php' ) );

    wp_safe_redirect( $redirect_url );
    exit;
}