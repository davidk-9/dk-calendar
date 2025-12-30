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

    /**
     * Get a contact by contactID using GET /api/contact/{contactID}
     */
    public function get_contact($contactID) {
        $path = '/api/contact/' . intval($contactID);
        return $this->request_get($path, array());
    }

    /**
     * Update a contact using PUT /api/contact/{contactID}
     * Expects array with keys to update (e.g., mobilephone)
     */
    public function update_contact($contactID, $payload) {
        $url = $this->base . '/api/contact/' . intval($contactID);
        $headers = $this->headers();
        
        // Axcelerate expects parameters in the URL query for PUT
        $form = array();
        if (isset($payload['mobilephone'])) $form['mobilephone'] = $payload['mobilephone'];
        if (isset($payload['mobilePhone']) && !isset($form['mobilephone'])) $form['mobilephone'] = $payload['mobilePhone'];
        
        if (!empty($form)) {
            $url .= (strpos($url, '?') === false ? '?' : '&') . http_build_query($form);
        }
        
        $args = array(
            'headers' => $headers,
            'timeout' => 20,
            'method' => 'PUT',
            'body' => ''
        );
        
        $resp = wp_remote_request($url, $args);
        if (is_wp_error($resp)) return new WP_Error('http_error', $resp->get_error_message());
        $code = wp_remote_retrieve_response_code($resp);
        $body = wp_remote_retrieve_body($resp);
        $data = json_decode($body, true);
        if ($code >= 200 && $code < 300) return $data;
        return new WP_Error('api_error', 'HTTP ' . $code . ' - ' . substr($body,0,500));
    }

    /**
     * Check course discounts for a contact and promo code
     * Expected query params: contactID, type, instanceID, originalPrice, PromoCode
     */
    public function get_discounts($contactID, $type, $instanceID, $originalPrice, $promoCode) {
        $query = array(
            'contactID' => intval($contactID),
            'type' => $type,
            'instanceID' => intval($instanceID),
            'originalPrice' => $originalPrice,
            'PromoCode' => $promoCode
        );
        return $this->request_get('/api/course/discounts', $query);
    }

    /**
     * Enrol a contact into a course (creates or adds to invoice).
     * Parameters should be provided as an associative array and will be sent as query params.
     * Example keys: instanceID, type, contactID, invoiceID, cost, discountIDList, payerID
     */
    public function enrol_course_query($params = array()) {
        $url = $this->base . '/api/course/enrol';
        if (!empty($params)) $url .= (strpos($url, '?') === false ? '?' : '&') . http_build_query($params);
        $args = array('headers' => $this->headers(), 'timeout' => 20, 'body' => '');
        $resp = wp_remote_post($url, $args);
        if (is_wp_error($resp)) return new WP_Error('http_error', $resp->get_error_message());
        $code = wp_remote_retrieve_response_code($resp);
        $body = wp_remote_retrieve_body($resp);
        $data = json_decode($body, true);
        if ($code >= 200 && $code < 300) return $data;
        return new WP_Error('api_error', 'HTTP ' . $code . ' - ' . substr($body,0,500));
    }

    /**
     * Fetch invoice details by invoice ID
     */
    public function get_invoice_by_id($invoiceID) {
        $path = '/api/accounting/invoice/' . rawurlencode($invoiceID);
        return $this->request_get($path, array());
    }

    /**
     * Request the hosted payment form for an invoice reference
     * Expected query params: reference, invoiceGUID, redirectURL, cancelURL
     */
    public function get_payment_form($query = array()) {
        return $this->request_get('/api/accounting/ecommerce/payment/form', $query);
    }

    /**
     * Query payment status by reference
     */
    public function get_payment_ref($reference) {
        $path = '/api/accounting/ecommerce/payment/ref/' . rawurlencode($reference);
        return $this->request_get($path, array());
    }
}

?>
