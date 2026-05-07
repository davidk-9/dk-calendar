# Legacy Functions Migration

## Overview
All legacy code from your theme's `functions.php` has been moved to the plugin to protect it from theme updates.

## What Was Done

1. **Created File**: `dk-legacy-functions.php` in the plugin root directory
   - Contains all the legacy code from your theme's functions.php
   - Properly secured with WordPress security checks
   - Documented with comments explaining what each section does

2. **Updated Main Plugin**: Modified `dk-course-calendar.php` to include the legacy functions file
   - Added `include_once plugin_dir_path( __FILE__ ) . 'dk-legacy-functions.php';`
   - This ensures the legacy code loads with the plugin

## How to Remove Code from Theme

You can now **safely remove** the following section from your theme's `functions.php`:

**Start removing from this line:**
```php
//DK custom stuff
//
//
/**
 * 1. Output the CSS styles for the loading overlay in the <head>.
```

**Stop removing at this line (remove everything up to and including):**
```php
add_shortcode('dk-workshops', 'dk_build_instancelist');
```

## What the Legacy Code Contains

The preserved code includes:

1. **Loading Spinner Functions**
   - `dk_add_spinner_css()` - Spinner CSS styles
   - `dk_add_spinner_html()` - Spinner HTML overlay
   - `dk_add_spinner_javascript()` - Spinner JavaScript functionality

2. **JavaScript Functions** (via `dk_javascript()`)
   - `dk_dostep1()` - Navigation function (likely replaced by plugin)
   - `getOffsetDate()` - Date calculation utility
   - `dk_calnav()` - Calendar navigation (likely replaced by plugin)
   - `formatDate()` - Date formatting utility
   - `getTargetMonthStart()` - Month calculation
   - `generateCalendarTable()` - Client-side calendar generation (likely replaced)
   - `dk_selDate()` - Date selection handler
   - Various jQuery page load scripts for URL parameter handling

3. **Legacy Shortcode**
   - `[dk-workshops]` - Old course instance list builder (likely replaced by `[dk_calendar]`)

## Important Notes

⚠️ **Most of this code is likely superseded by the current plugin functionality:**
- The calendar is now rendered via AJAX in `dk-calendar.js`
- The enrollment flow is handled by `dk-enrolment.js`
- The plugin has its own loading mechanisms

💡 **Recommendation:**
- Test your site thoroughly after removing the code from functions.php
- If everything works correctly, you can consider removing unused functions from `dk-legacy-functions.php` in the future
- For now, it's safely preserved and won't interfere with theme updates

## Testing Checklist

After removing code from functions.php:

- [ ] Calendar displays correctly
- [ ] Course filtering works (dropdowns + "Get Started" button)
- [ ] Month navigation works
- [ ] Enrollment flow works
- [ ] No JavaScript errors in browser console
- [ ] Loading states display properly

## If Something Breaks

If you encounter issues after removal:
1. The legacy code is still active in the plugin
2. Check browser console for JavaScript errors
3. Verify the plugin is active
4. Contact your developer if specific legacy functionality is needed

## File Locations

- Legacy Functions: `/wp-content/plugins/dk-course-calendar/dk-legacy-functions.php`
- Main Plugin: `/wp-content/plugins/dk-course-calendar/dk-course-calendar.php`
- This Guide: `/wp-content/plugins/dk-course-calendar/LEGACY-MIGRATION.md`
