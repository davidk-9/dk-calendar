jQuery(document).ready(function($) {
    if (typeof DKCalendarData === 'undefined') {
        return;
    }

    // Prevent double init if this script is loaded more than once
    if (window.__dkCalendarInit) {
        return;
    }
    window.__dkCalendarInit = true;

    // Safety: remove any old delegated handlers from previous loads
    $(document).off('.dkcal');

    // --- 1. Helper Functions ---
    const isMobile = () => $(window).width() < 768;

    // Helper to format Time Range
    function formatTimeRange(startTime, finishDate) {
        const formatTime = (timeStr) => {
            const parts = (timeStr || '').split(':');
            let hours = parseInt(parts[0] || '0', 10);
            const minutes = parts[1] || '00';
            const ampm = hours >= 12 ? 'pm' : 'am';
            hours = hours % 12;
            hours = hours ? hours : 12;
            return hours + ':' + minutes + ' ' + ampm;
        };

        const startTimeFormatted = formatTime(startTime || '00:00');
        const finishTimePart = ((finishDate || '').split(' ')[1]) || '';
        const finishTimeFormatted = finishTimePart ? formatTime(finishTimePart) : '';
        return finishTimeFormatted ? (startTimeFormatted + ' – ' + finishTimeFormatted) : startTimeFormatted;
    }

    // Helper to format Vacancy based on business rule
    function formatVacancy(vacancy) {
        const v = parseInt(vacancy, 10);
        if (!isFinite(v)) return '0';
        if (v >= 10) return "10+";
        if (v >= 5) return "5+";
        return v.toString();
    }
    
    // NEW Helper: Truncation and Ellipsis
    function truncateText(text, maxLength = 50, ellipsis = '...') {
        const t = (text || '').toString();
        const truncateLength = maxLength - ellipsis.length;
        if (t.length > maxLength) {
            return t.substring(0, truncateLength) + ellipsis;
        }
        return t;
    }

    // Weekday labels: Su Mo Tu We Th Fr Sa
    function updateWeekdayLabels() {
        const map = {
            Sunday: 'Su', Monday: 'Mo', Tuesday: 'Tu', Wednesday: 'We',
            Thursday: 'Th', Friday: 'Fr', Saturday: 'Sa',
            Sun: 'Su', Mon: 'Mo', Tue: 'Tu', Wed: 'We',
            Thu: 'Th', Fri: 'Fr', Sat: 'Sa'
        };

        $('#dk-calendar-ajax-container').find('.dk-day-name').each(function() {
            const t = $(this).text().trim();
            if (map[t]) $(this).text(map[t]);
        });
    }

    // Prev/next buttons show actual month names with arrows
    function updateMonthNavLabels() {
        const $container = $('#dk-calendar-ajax-container');
        const headerText = $container.find('.dk-calendar-header h2').first().text().trim(); // eg "March 2026"
        const parts = headerText.split(/\s+/);
        if (parts.length < 2) return;

        const monthName = parts[0];
        const year = parseInt(parts[1], 10);
        if (!year) return;

        const months = [
            'January','February','March','April','May','June',
            'July','August','September','October','November','December'
        ];

        const idx = months.indexOf(monthName);
        if (idx === -1) return;

        const prev = new Date(year, idx - 1, 1);
        const next = new Date(year, idx + 1, 1);

        const prevLabel = months[prev.getMonth()];
        const nextLabel = months[next.getMonth()];

        $container.find('.dk-prev-month').text('‹ ' + prevLabel);
        $container.find('.dk-next-month').text(nextLabel + ' ›');
    }

    function applyCalendarUiTextTweaks() {
        updateWeekdayLabels();
        updateMonthNavLabels();
    }

    // --- 2. AJAX Calendar Loader ---
    function loadCalendarContent(isInitialLoad = false) {
        const $container = $('#dk-calendar-ajax-container');
        // Guard: if no calendar container on page (e.g. enrolment shortcode only), exit safely
        if ( $container.length === 0 ) return;
        
        // Clear enrollment flow state when calendar loads (fresh start for each course selection)
        // Only clear when we're actually loading the calendar, not on enrollment page
        const STORAGE_KEY = 'dk_enrolment_state';
        sessionStorage.removeItem(STORAGE_KEY);
        
        // On initial page load, sync sessionStorage with URL params (URL is source of truth from home page)
        if (isInitialLoad) {
            const urlParams = new URLSearchParams(window.location.search);
            const urlCourse = urlParams.get('c_id') || '';
            const urlLocation = urlParams.get('l_name') || '';
            
            // Clear or set sessionStorage based on URL params
            if (urlCourse) {
                sessionStorage.setItem('dk_selected_course', urlCourse);
            } else {
                sessionStorage.removeItem('dk_selected_course');
            }
            
            if (urlLocation) {
                sessionStorage.setItem('dk_selected_location', urlLocation);
            } else {
                sessionStorage.removeItem('dk_selected_location');
            }
        } else {
            // During AJAX reload (month navigation), store current dropdown values
            if (DKCalendarData.course_id_selector) {
                const $courseDropdown = $('#' + DKCalendarData.course_id_selector);
                if ($courseDropdown.length) {
                    const val = $courseDropdown.val();
                    if (val) {
                        sessionStorage.setItem('dk_selected_course', val);
                    } else {
                        sessionStorage.removeItem('dk_selected_course');
                    }
                }
            }
            if (DKCalendarData.location_id_selector) {
                const $locationDropdown = $('#' + DKCalendarData.location_id_selector);
                if ($locationDropdown.length) {
                    const val = $locationDropdown.val();
                    if (val) {
                        sessionStorage.setItem('dk_selected_location', val);
                    } else {
                        sessionStorage.removeItem('dk_selected_location');
                    }
                }
            }
        }
        
        const containerClass = $container.attr('class') || '';
        const layoutMatch = containerClass.match(/dk-layout-(\w+)/);
        const layout = layoutMatch ? layoutMatch[1] : 'default';
        
        $container.find('.dk-loading-spinner-wrapper').show();

        $.ajax({
            url: DKCalendarData.ajax_url,
            type: 'POST',
            data: {
                action: 'dk_render_calendar',
                filters: DKCalendarData.current_filters,
                layout: layout
            },
            success: function(response) {
                if (response && response.success) {
                    // Remove any previously rendered calendar markup inside container (prevents duplicates)
                    $container.find('#dk-calendar-content').remove();
                    $container.find('.dk-calendar-content').remove();
                    $container.find('.dk-calendar-header').remove();
                    $container.find('.dk-calendar-grid').remove();
                    $container.find('#dk-course-details').remove();

                    // Insert the new calendar markup
                    $container.append(response.data.html);

                    $container.find('.dk-loading-spinner-wrapper').hide();
                    initialSetup();
                } else {
                    $container.html('<p style="color:red;">Error loading calendar data. Please check plugin settings.</p>');
                }
            },
            error: function(xhr, status, error) {
                $container.html('<p style="color:red;">Error connecting to the server. Check your network or server logs.</p>');
                console.error("AJAX Error:", status, error);
            }
        });
    }

    // --- 3. Initial Setup (Runs AFTER AJAX loads content) ---
    function initialSetup() {
        // Restore dropdown values from sessionStorage (already synced with URL on initial load)
        if (DKCalendarData.course_id_selector) {
            const $courseDropdown = $('#' + DKCalendarData.course_id_selector);
            if ($courseDropdown.length) {
                const courseValue = sessionStorage.getItem('dk_selected_course');
                if (courseValue) {
                    $courseDropdown.val(courseValue);
                } else {
                    // Clear dropdown if no stored value (user selected "All")
                    $courseDropdown.val('');
                }
            }
        }
        
        if (DKCalendarData.location_id_selector) {
            const $locationDropdown = $('#' + DKCalendarData.location_id_selector);
            if ($locationDropdown.length) {
                const locationValue = sessionStorage.getItem('dk_selected_location');
                if (locationValue) {
                    $locationDropdown.val(locationValue);
                } else {
                    // Clear dropdown if no stored value (user selected "All")
                    $locationDropdown.val('');
                }
            }
        }
        
        // Apply text tweaks after new HTML is present
        applyCalendarUiTextTweaks();
        
        // Default Action: Click the first available day when the page loads
        const $firstAvailableDay = $('#dk-calendar-ajax-container').find('.dk-has-courses:first');
        if ($firstAvailableDay.length) {
            setTimeout(function() {
                $firstAvailableDay.trigger('click');
            }, 100); 
        }
    }

    // --- 4. Event Handler for Date Click (Calendar Interactivity) ---
    $(document).on('click.dkcal', '.dk-has-courses', function() {
        const $cell = $(this);
        const courses = $cell.data('courses');
        const day = $cell.data('day');

        $('.dk-day').removeClass('dk-active');
        $cell.addClass('dk-active');
        renderCourseDetails(day, courses);

        // Auto scroll only on mobile (desktop stays put)
        if (isMobile()) {
            const $details = $('#dk-course-details');
            if ($details.length) {
                $('html, body').animate({
                    scrollTop: $details.offset().top - 50
                }, 500);
            }
        }
    });
    
    // --- 4a. Event Handler for Dropdown Changes (Store selections) ---
    $(document).on('change.dkcal', '#' + DKCalendarData.course_id_selector, function() {
        const value = $(this).val();
        if (value) {
            sessionStorage.setItem('dk_selected_course', value);
        } else {
            // User selected "All Courses" - clear storage
            sessionStorage.removeItem('dk_selected_course');
        }
    });
    
    $(document).on('change.dkcal', '#' + DKCalendarData.location_id_selector, function() {
        const value = $(this).val();
        if (value) {
            sessionStorage.setItem('dk_selected_location', value);
        } else {
            // User selected "All Locations" - clear storage
            sessionStorage.removeItem('dk_selected_location');
        }
    });
    
    // --- 4b. Event Handler for Month Navigation (Prevent default and maintain filters) ---
    $(document).on('click.dkcal', '.dk-prev-month, .dk-next-month', function(e) {
        e.preventDefault();
        
        // Get the target URL from the link
        const href = $(this).attr('href') || '';
        const urlParams = new URLSearchParams((href.split('?')[1]) || '');
        
        // Get current dropdown values (from sessionStorage or dropdowns)
        let courseValue = sessionStorage.getItem('dk_selected_course');
        let locationValue = sessionStorage.getItem('dk_selected_location');
        
        // Override with current dropdown values if they exist
        if (DKCalendarData.course_id_selector) {
            const $courseDropdown = $('#' + DKCalendarData.course_id_selector);
            if ($courseDropdown.length && $courseDropdown.val()) {
                courseValue = $courseDropdown.val();
            }
        }
        if (DKCalendarData.location_id_selector) {
            const $locationDropdown = $('#' + DKCalendarData.location_id_selector);
            if ($locationDropdown.length && $locationDropdown.val()) {
                locationValue = $locationDropdown.val();
            }
        }
        
        // Add dropdown values to URL params if they exist
        if (courseValue) {
            urlParams.set('c_id', courseValue);
        }
        if (locationValue) {
            urlParams.set('l_name', locationValue);
        }
        
        // Update the URL in browser without reloading
        const newUrl = window.location.pathname + '?' + urlParams.toString();
        window.history.pushState({}, '', newUrl);
        
        // Update DKCalendarData.current_filters for the AJAX call
        DKCalendarData.current_filters = {
            c_id: courseValue || '',
            l_name: locationValue || '',
            d_from: urlParams.get('d_from'),
            d_to: urlParams.get('d_to')
        };
        
        // Reload calendar content with updated filters
        loadCalendarContent();
    });

    // --- 5. Function to Render the Course Details Table (FINAL VERSION) ---
    function renderCourseDetails(day, courses) {
        const monthLabel = $('#dk-calendar-ajax-container').find('.dk-calendar-header h2').first().text().trim();
        let html = '<h3>Courses Available on ' + day + ' ' + monthLabel + '</h3>';
        html += '<table class="dk-course-table">';
        // COLUMN ORDER CHANGE: Available Seats now before Cost
        html += '<thead><tr><th>Time</th><th>Course Name</th><th>Location</th><th>Available Seats</th><th>Cost</th><th>Action</th></tr></thead>';
        html += '<tbody>';

        if (courses && courses.length > 0) {
            // Filter out past courses ONLY for today's date
            const currentTime = new Date();
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Reset to start of day for date comparison
            
            const upcomingCourses = courses.filter(course => {
                // Check if course date is today
                try {
                    const courseDateObj = new Date(course.start_date);
                    courseDateObj.setHours(0, 0, 0, 0); // Reset to start of day for date comparison
                    
                    // If course is NOT today, show it (future days show all courses)
                    if (courseDateObj.getTime() !== today.getTime()) {
                        return true;
                    }
                    
                    // Course IS today - check if it has already started
                    // Parse start time - handle time range format (e.g., "12:45 am – 2:45 pm")
                    let startTime = course.start_time || '';
                    if (startTime && (startTime.includes('–') || startTime.includes('-'))) {
                        // Split on dash and take the first part (start time)
                        startTime = startTime.split(/[–-]/)[0].trim();
                    }
                    
                    // Combine date and time for comparison
                    const courseStartDateTime = new Date(course.start_date + ' ' + startTime);
                    if (isNaN(courseStartDateTime.getTime())) return true;
                    
                    // Return true if course hasn't started yet
                    return courseStartDateTime >= currentTime;
                } catch (error) {
                    // If parsing fails, include the course (fail-open approach)
                    console.log('Error parsing course datetime, including in display:', error);
                    return true;
                }
            });
            
            if (upcomingCourses.length > 0) {
                upcomingCourses.forEach(course => {
                    const timeRange = formatTimeRange(course.start_time, course.finish_date);
                    const courseDateObj = new Date(course.start_date);
                    const courseDateStr = courseDateObj.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
                
                // Formatted data for display and URL
                const formattedCost = '$' + (parseFloat(course.cost) || 0).toFixed(2);
                const formattedVacancy = formatVacancy(course.vacancy); // Apply business rule
                
                // COURSE NAME CHANGE: Course Code - Course Name (Full and Truncated)
                const formattedCourseNameFull = (course.course_code || '') + ' - ' + (course.course_name || ''); // Fix 'undefined' error
                const formattedCourseNameTruncated = truncateText(formattedCourseNameFull, 50); // Apply truncation

                // Build the final, absolute enrolment URL
                // Use window.location.origin for reliable base URL
                const baseUrl = window.location.origin;
                // Check if we're in developer mode by looking at the current path
                const isDeveloper = window.location.pathname.includes('/developer/');
                // Build the enrol link with proper path
                let enrolLink = baseUrl + (isDeveloper ? '/developer/' : '/') + DKCalendarData.enrol_page_slug;

                const params = {
                    course_id: course.course_id,
                    course_type: 'w', 
                    instance_id: course.instance_id,
                    course_date: courseDateStr,
                    course_location: course.location,
                    course_time: timeRange,
                    // Use the canonical course name (not the instance name)
                    course_name: course.course_name || course.instance_name || '',
                    // Include course code and raw vacancy (spaces available)
                    course_code: course.course_code || '',
                    spaces_avail: typeof course.vacancy !== 'undefined' ? parseInt(course.vacancy, 10) : 0,
                    course_cost: formattedCost
                };
                
                enrolLink += '?' + $.param(params);
                
                html += '<tr>';
                html += '<td data-label="Time">' + timeRange + '</td>';
                // Apply truncation and tooltip (title attribute)
                html += '<td data-label="Course Name" title="' + formattedCourseNameFull + '">' + formattedCourseNameTruncated + '</td>'; 
                html += '<td data-label="Location">' + (course.location || '') + '</td>';
                // COLUMN ORDER SWAP START
                html += '<td data-label="Available Seats">' + formattedVacancy + '</td>'; 
                html += '<td data-label="Cost">' + formattedCost + '</td>';
                // COLUMN ORDER SWAP END
                html += '<td data-label="Action"><a href="' + enrolLink + '" class="button dk-enrol-btn">Enrol Now</a></td>';
                html += '</tr>';
            });
            } else {
                // All courses have passed
                html += '<tr><td colspan="6">No upcoming courses available on this day.</td></tr>';
            }
        } else {
            html += '<tr><td colspan="6">No courses available on this day.</td></tr>';
        }

        html += '</tbody></table>';

        $('#dk-course-details').html(html).slideDown();
        updateScrollButtonVisibility();
    }


    // --- 6. Scroll-to-Top Button Logic ---
    const $scrollUpButton = $('<button id="dk-scroll-up" class="dk-floating-btn" style="display:none;">&#9650;</button>');
    $('body').append($scrollUpButton); 

    $scrollUpButton.on('click', function() {
        $('html, body').animate({ scrollTop: 0 }, 500);
    });

    const updateScrollButtonVisibility = () => {
        if (isMobile() && $(window).scrollTop() > 100) {
            $scrollUpButton.fadeIn();
        } else {
            $scrollUpButton.fadeOut();
        }
    };
    
    $(window).on('scroll', updateScrollButtonVisibility);
    
    // --- Initial Kickoff ---
    loadCalendarContent(true); // isInitialLoad = true for first page load
});