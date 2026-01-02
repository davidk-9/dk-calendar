jQuery(document).ready(function($) {
    if (typeof DKCalendarData === 'undefined') {
        return;
    }

    // --- 1. Helper Functions ---
    const isMobile = () => $(window).width() < 768;

    // Helper to format Time Range
    function formatTimeRange(startTime, finishDate) {
        const formatTime = (timeStr) => {
            const parts = timeStr.split(':');
            let hours = parseInt(parts[0]);
            const minutes = parts[1];
            const ampm = hours >= 12 ? 'pm' : 'am';
            hours = hours % 12;
            hours = hours ? hours : 12; 
            return hours + ':' + minutes + ' ' + ampm;
        };

        const startTimeFormatted = formatTime(startTime);
        const finishTimePart = finishDate.split(' ')[1];
        const finishTimeFormatted = formatTime(finishTimePart);
        
        return startTimeFormatted + ' – ' + finishTimeFormatted;
    }

    // Helper to format Vacancy based on business rule
    function formatVacancy(vacancy) {
        if (vacancy >= 10) {
            return "10+";
        } else if (vacancy >= 5) {
            return "5+";
        } else {
            return vacancy.toString();
        }
    }
    
    // NEW Helper: Truncation and Ellipsis
    function truncateText(text, maxLength = 50, ellipsis = '...') {
        const truncateLength = maxLength - ellipsis.length;
        if (text.length > maxLength) {
            // Truncate to 47 characters and add '...'
            return text.substring(0, truncateLength) + ellipsis;
        }
        return text;
    }

    // --- 2. AJAX Calendar Loader ---
    function loadCalendarContent() {
        const $container = $('#dk-calendar-ajax-container');
        // Guard: if no calendar container on page (e.g. enrolment shortcode only), exit safely
        if ( $container.length === 0 ) return;
        
        // Clear enrollment flow state when calendar loads (fresh start for each course selection)
        // Only clear when we're actually loading the calendar, not on enrollment page
        const STORAGE_KEY = 'dk_enrolment_state';
        sessionStorage.removeItem(STORAGE_KEY);
        
        const containerClass = $container.attr('class') || '';
        const layoutMatch = containerClass.match(/dk-layout-(\w+)/);
        const layout = layoutMatch ? layoutMatch[1] : 'default';
        
        $container.find('.dk-loading-spinner-wrapper').show();
        $container.find('#dk-calendar-content').remove();

        $.ajax({
            url: DKCalendarData.ajax_url,
            type: 'POST',
            data: {
                action: 'dk_render_calendar',
                filters: DKCalendarData.current_filters,
                layout: layout
            },
            success: function(response) {
                if (response.success) {
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
        // Find filter dropdowns and apply current URL filters (for visual sync)
        const urlParams = new URLSearchParams(window.location.search);
        const cId = urlParams.get('c_id');
        const lName = urlParams.get('l_name');
        
        if (cId && DKCalendarData.course_id_selector) {
            $('#' + DKCalendarData.course_id_selector).val(cId);
        }
        if (lName && DKCalendarData.location_id_selector) {
            $('#' + DKCalendarData.location_id_selector).val(lName);
        }
        
        // Default Action: Click the first available day when the page loads
        const $firstAvailableDay = $('.dk-has-courses:first');
        if ($firstAvailableDay.length) {
            setTimeout(function() {
                $firstAvailableDay.trigger('click');
            }, 100); 
        }
    }

    // --- 4. Event Handler for Date Click (Calendar Interactivity) ---
    $(document).on('click', '.dk-has-courses', function() {
        const $cell = $(this);
        const courses = $cell.data('courses');
        const day = $cell.data('day');
        const layout = $('#dk-course-details').data('layout');

        $('.dk-day').removeClass('dk-active');
        $cell.addClass('dk-active');
        renderCourseDetails(day, courses);

        // Auto-Scroll Logic
        if (layout === 'default' || isMobile()) {
            $('html, body').animate({
                scrollTop: $('#dk-course-details').offset().top - 50 
            }, 500);
        }
    });

    // --- 5. Function to Render the Course Details Table (FINAL VERSION) ---
    function renderCourseDetails(day, courses) {
        let html = '<h3>Courses Available on ' + day + ' ' + $('.dk-calendar-header h2').text() + '</h3>';
        html += '<table class="dk-course-table">';
        // COLUMN ORDER CHANGE: Available Seats now before Cost
        html += '<thead><tr><th>Time</th><th>Course Name</th><th>Location</th><th>Available Seats</th><th>Cost</th><th>Action</th></tr></thead>';
        html += '<tbody>';

        if (courses && courses.length > 0) {
            courses.forEach(course => {
                const timeRange = formatTimeRange(course.start_time, course.finish_date);
                const courseDateObj = new Date(course.start_date);
                const courseDateStr = courseDateObj.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
                
                // Formatted data for display and URL
                const formattedCost = '$' + parseFloat(course.cost).toFixed(2);
                const formattedVacancy = formatVacancy(course.vacancy); // Apply business rule
                
                // COURSE NAME CHANGE: Course Code - Course Name (Full and Truncated)
                const formattedCourseNameFull = course.course_code + ' - ' + (course.course_name || ''); // Fix 'undefined' error
                const formattedCourseNameTruncated = truncateText(formattedCourseNameFull, 50); // Apply truncation

                // Build the final, absolute enrolment URL
                const baseUrl = DKCalendarData.current_url.split('/developer/')[0] + '/' + (DKCalendarData.current_url.includes('/developer') ? 'developer/' : '');
                let enrolLink = baseUrl + DKCalendarData.enrol_page_slug;

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
                html += '<td data-label="Location">' + course.location + '</td>';
                // COLUMN ORDER SWAP START
                html += '<td data-label="Available Seats">' + formattedVacancy + '</td>'; 
                html += '<td data-label="Cost">' + formattedCost + '</td>';
                // COLUMN ORDER SWAP END
                html += '<td data-label="Action"><a href="' + enrolLink + '" class="button dk-enrol-btn">Enrol Now</a></td>';
                html += '</tr>';
            });
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
    loadCalendarContent();
});