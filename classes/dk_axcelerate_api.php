<?php
// classes/dk_axcelerate_api.php
defined('ABSPATH') or die('No script kiddies please!');

class DK_Axcelerate_API {
    private $base;
    private $wstoken;
    private $apitoken;

    public function __construct() {
        // Base host used elsewhere in the plugin
        $this->base = 'https://lifesavingfirstaid.app.axcelerate.com';
        $this->wstoken = get_option('dk_api_wstoken');
        $this->apitoken = get_option('dk_api_apitoken');
    }

    private function headers() {
        return array(
            'wstoken' => $this->wstoken,
            'apitoken' => $this->apitoken,
            'Content-Type' => 'application/json'
        );
    }

    private function request_get($path, $query = array()) {
        $url = $this->base . $path;
        if (!empty($query)) $url .= (strpos($url, '?') === false ? '?' : '&') . http_build_query($query);
        $args = array('headers' => $this->headers(), 'timeout' => 20);
        $resp = wp_remote_get($url, $args);
        if (is_wp_error($resp)) return new WP_Error('http_error', $resp->get_error_message());
        $code = wp_remote_retrieve_response_code($resp);
        $body = wp_remote_retrieve_body($resp);
        $data = json_decode($body, true);
        if ($code >= 200 && $code < 300) return $data;
        return new WP_Error('api_error', 'HTTP ' . $code . ' - ' . substr($body,0,500));
    }

    private function request_post($path, $payload = array()) {
        $url = $this->base . $path;
        // Default to JSON payload, but callers can pass already-encoded or arrays
        $headers = $this->headers();
        $body = wp_json_encode($payload);
        $args = array('headers' => $headers, 'timeout' => 20, 'body' => $body);
        $resp = wp_remote_post($url, $args);
        if (is_wp_error($resp)) return new WP_Error('http_error', $resp->get_error_message());
        $code = wp_remote_retrieve_response_code($resp);
        $body = wp_remote_retrieve_body($resp);
        $data = json_decode($body, true);
        if ($code >= 200 && $code < 300) return $data;
        return new WP_Error('api_error', 'HTTP ' . $code . ' - ' . substr($body,0,500));
    }

    /**
     * Search contacts by givenName, surname and emailAddress
     * Returns array of contact objects or empty array
     */
    public function search_contacts($givenName, $surname, $emailAddress) {
        $query = array();
        if ($givenName !== null) $query['givenName'] = $givenName;
        if ($surname !== null) $query['surname'] = $surname;
        if ($emailAddress !== null) $query['emailAddress'] = $emailAddress;
        return $this->request_get('/api/contacts/search', $query);
    }

    /**
     * Create a contact using POST /api/contact/
     * Expects array with keys like givenName, surname, emailAddress, mobilePhone
     */
    public function create_contact($payload) {
        // The Axcelerate create contact endpoint expects form-encoded fields (not JSON)
        $url = $this->base . '/api/contact/';
        $headers = $this->headers();
        // Use form-encoded content type
        $headers['Content-Type'] = 'application/x-www-form-urlencoded';

        // Ensure parameter names match Axcelerate expectations
        $form = array();
        if (isset($payload['givenName'])) $form['givenName'] = $payload['givenName'];
        if (isset($payload['surname'])) $form['surname'] = $payload['surname'];
        if (isset($payload['emailAddress'])) $form['emailAddress'] = $payload['emailAddress'];
        // mobilephone (lowercase) is expected
        if (isset($payload['mobilephone'])) $form['mobilephone'] = $payload['mobilephone'];
        if (isset($payload['mobilePhone']) && !isset($form['mobilephone'])) $form['mobilephone'] = $payload['mobilePhone'];

        // Axcelerate expects parameters in the URL query for this endpoint.
        $url .= (strpos($url, '?') === false ? '?' : '&') . http_build_query($form);
        $args = array('headers' => $headers, 'timeout' => 20, 'body' => '');
        $resp = wp_remote_post($url, $args);
        if (is_wp_error($resp)) return new WP_Error('http_error', $resp->get_error_message());
        $code = wp_remote_retrieve_response_code($resp);
        $body = wp_remote_retrieve_body($resp);
        $data = json_decode($body, true);
        if ($code >= 200 && $code < 300) return $data;
        return new WP_Error('api_error', 'HTTP ' . $code . ' - ' . substr($body,0,500));
    }
}

?>
