<?php
/**
 * Legacy Functions from Theme functions.php
 * 
 * This file contains legacy code that was originally in the theme's functions.php.
 * It's preserved here for backwards compatibility in case any functionality is still being used.
 * 
 * WARNING: Most of this code is likely superseded by the main plugin functionality.
 * Consider reviewing and removing unused functions over time.
 */

// Prevent direct access
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Output the CSS styles for the loading overlay in the <head>.
 */
function dk_add_spinner_css() {
    // CSS only (output in <head>)
    echo '
    <style>
        /* Full-screen dark overlay */
        #dk-loading-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            z-index: 99999;
            display: flex;
            justify-content: center;
            align-items: center;
            text-align: center;
            color: white;
            font-family: Arial, sans-serif;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s ease, visibility 0s 0.3s; /* Hide transition delay on visibility */
        }

        /* Spinner and text container */
        .dk-spinner-content {
            padding: 20px;
            border-radius: 8px;
            background-color: #333;
        }

        /* The actual spinner style */
        .dk-spinner {
            border: 8px solid #f3f3f3;
            border-top: 8px solid #3498db;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
            margin: 0 auto 15px;
        }

        /* Animation keyframes */
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        /* Loading text style */
        .dk-spinner-content p {
            margin: 0;
            font-size: 1.1em;
        }

        /* Class to show the overlay (used by JavaScript) */
        #dk-loading-overlay.is-active {
            opacity: 1;
            visibility: visible;
            transition: opacity 0.3s ease, visibility 0s; /* No transition delay on visibility when active */
        }
    </style>';
}
add_action( 'wp_head', 'dk_add_spinner_css' );

/**
 * Output the HTML structure for the spinner in the footer.
 */
function dk_add_spinner_html() {
    // HTML only (output in footer)
    echo '
    <div id="dk-loading-overlay">
        <div class="dk-spinner-content">
            <div class="dk-spinner"></div>
            <p>Finding available course dates and times for your selected course and location...</p>
        </div>
    </div>';
}
add_action( 'wp_footer', 'dk_add_spinner_html', 5 ); // Priority 5 to output early in the footer

/**
 * Output the JavaScript function in the footer.
 */
function dk_add_spinner_javascript() {
    echo '
    <script>
        // Ensure jQuery is available and use $ for simplicity
        (function($) {
            
            // Your original function, modified to show the spinner before redirecting
            window.dk_dostep1 = function(pathname) {
                
                var dk_course = $("#dk_courses").val();
                var dk_location = $("#dk_locations").val();
                // Assume getOffsetDate is available globally or defined elsewhere
                var dk_datefrom = getOffsetDate(0,0);
                var dk_dateto = getOffsetDate(0,1);
                
                // Build the URL
                var dk_href;
                if (window.location.href.includes(\'developer\')) {
                    dk_href = window.location.origin + \'/developer\' + pathname + \'?c_id=\' + dk_course + \'&l_name=\' + dk_location;    
                } else {
                    dk_href = window.location.origin + pathname + \'?c_id=\' + dk_course + \'&l_name=\' + dk_location;      
                }
                
                if (dk_datefrom) {dk_href += \'&d_from=\' + dk_datefrom;}
                if (dk_dateto) {dk_href += \'&d_to=\' + dk_dateto;}
                
                // --- SPINNER CODE ---
                
                // 1. Add the "is-active" class to the overlay to show it with CSS transitions
                $("#dk-loading-overlay").addClass("is-active"); 

                // 2. Set a small timeout to ensure the browser has time to render 
                // the overlay before it initiates the page change.
                setTimeout(function() {
                    window.location.href = dk_href;
                }, 100); // 100ms is enough to visually engage the user with the spinner
                
                // --- END SPINNER CODE ---
            }
            
        })(jQuery);
    </script>';
}
add_action( 'wp_footer', 'dk_add_spinner_javascript', 10 ); // Priority 10 for JS

/**
 * Legacy JavaScript functions for calendar and course navigation.
 * NOTE: Most of this functionality has been replaced by the main plugin JS files.
 */
function dk_javascript() {
    
?>
<script>
// booking step 1 script
function dk_dostep1(pathname) {

jQuery(document).ready(function($) {
  
   var dk_course = $("#dk_courses").val();
   var dk_location = $("#dk_locations").val();
   var dk_datefrom = getOffsetDate(0,0);
   var dk_dateto = getOffsetDate(0,1);
	//alert (window.location.href);
   if (window.location.href.includes('developer')) {
	   var dk_href = window.location.origin + '/developer' + pathname + '?c_id=' + dk_course + '&l_name=' + dk_location; 
   } else {
	 	var dk_href = window.location.origin + pathname + '?c_id=' + dk_course + '&l_name=' + dk_location;  
   }
	
   if (dk_datefrom) {dk_href += '&d_from=' + dk_datefrom;}
   if (dk_dateto) {dk_href += '&d_to=' + dk_dateto;}
	$("#dk-loading-overlay").addClass("is-active");
	window.location.href = dk_href;

   
})
}
						  
function getOffsetDate(monthOffset = 0, dayType = 0) {

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); 
    const targetDate = new Date(currentYear, currentMonth + monthOffset, 1);
    if (dayType === 0) {
    } else {
        targetDate.setMonth(targetDate.getMonth() + 1);
        targetDate.setDate(0);
    }
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}	

function dk_calnav(startDate, endDate) {
	var queryString = window.location.search;
	var urlParams = new URLSearchParams(queryString);
	urlParams.set('d_sel', startDate);
	urlParams.set('d_to', endDate);
	urlParams.set('d_from', startDate);
	window.location.search = urlParams;
}
	
// page load scripts
jQuery(document).ready(function($) {
	
	var queryString = window.location.search;
	var urlParams = new URLSearchParams(queryString);
	var dk_course = urlParams.get('c_id');
	var dk_location = urlParams.get('l_name');
	var dk_dateTo = urlParams.get('d_to');
	var dk_dateFrom = urlParams.get('d_from');
	var dk_courseDate = urlParams.get('course_date');
	var dk_courseTime = urlParams.get('course_time');
	var dk_courseLocation = urlParams.get('course_location');
	var dk_courseName = urlParams.get('course_name');
	var dk_courseCost = urlParams.get('course_cost');
	var dk_selDate = urlParams.get('d_sel');
	
	if (dk_course){ $("#dk_courses").val(dk_course);}
	if (dk_location){ $("#dk_locations").val(dk_location);}	
	if (dk_dateFrom){ $("#dk_datefrom").val(dk_dateFrom)}
	if (dk_dateTo){ $("#dk_dateto").val(dk_dateTo)}
	//alert(dk_selDate);
	if (dk_selDate){} else {dk_selDate = formatDate(new Date());}
	var dTo = new Date();
	var dFrom = new Date();
	//alert(dk_selDate);
	
	$('#calculate').text("Apply Discount Code");
	
	if (dk_dateTo){ dTo = new Date(Date.parse(dk_dateTo + ' 00:00:00 GMT+1000'));}else{dTo = new Date(Date.parse(getOffsetDate(0,1) + ' 00:00:00 GMT+1000'));}
	if (dk_dateFrom){ dFrom = new Date(Date.parse(dk_dateFrom+ ' 00:00:00 GMT+1000'));}else{dFrom = new Date(Date.parse(getOffsetDate(0,0) + ' 00:00:00 GMT+1000'));}
	
	// in here we need to determine what part of process we are in possibly by interogating the first part of url? or a url param.
	// Then using that determination we can set flags that will either hide or show calendar, and hide or show results listings.
	
	var bCal = true;
	var bList = true;
	var aDates = [];
	
	$('div.ax-course-instance-list.ax-table').find('tr').each(function(){
		var currrentRow=$(this);
		var dateField=currrentRow.find("td:eq(5)").text();
		var dF = new Date(Date.parse(dateField));
	    if (dateField!='Date'){
		//currrentRow.hide();
		//currrentRow.css('display', 'none');
		currrentRow.attr('class','rowHide');
		if (dF >= dFrom && dF <= dTo) { 
			if(Date.parse(dateField)) {aDates.push(formatDate(dF))};
		}
		//if (dF == Date.parse(dk_selDate)) { currrentRow.css('display:table-row;');}
			if (formatDate(dF) == dk_selDate) { 
				//currrentRow.show();
				//currrentRow.css('display', 'table-row');
				currrentRow.attr('class','rowShow');
				console.log(currrentRow.find('a:eq(0)')[0].href);
				var ahref = currrentRow.find('a:eq(0)')[0].href;
				if (window.location.href.includes('developer')) {
					var atag = ahref.split('/');
					ahref = atag[0] + '//'+ atag[2] + '/developer/' + atag[3];
					console.log (ahref);
				}
				
				currrentRow.find('a:eq(0)')[0].href = ahref + 
					'&course_date=' + dateField + '&course_location=' + currrentRow.find("td:eq(3)").text() +
					'&course_time=' + currrentRow.find("td:eq(0)").text() + 
					'&course_name=' + currrentRow.find("td:eq(4)").text() +
					'&course_cost=' + currrentRow.find("td:eq(1)").text();
				
			}
		}
	});
	
	if (bCal) {
		const newCalendar = generateCalendarTable(aDates, dk_selDate);
	    const targetContainer = $('div.ax-course-instance-list.ax-table').parent();
		if (targetContainer.length) {
				//alert(aDates);
			targetContainer.prepend(newCalendar);
		}
	}
	
	
	$('#dk_course_name').text(dk_courseName);
	$('#dk_course_cost').text(dk_courseCost);
	$('#dk_course_date').text(dk_courseDate);
	$('#dk_course_time').text(dk_courseTime);
	$('#dk_course_location').text(dk_courseLocation);
	
	$(window).on('DOMContentLoaded load resize scroll', function(event) {
		$('#calculate').text("Apply Discount Code");
	});
	
});
	
function formatDate(date) {
    var year = date.getFullYear();
    // Months are 0-indexed (0-11), so add 1. padStart ensures 2 digits (e.g., '07').
    var month = String(date.getMonth() + 1).padStart(2, '0');
    // padStart ensures 2 digits (e.g., '05').
    var day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}	
	
function getTargetMonthStart(monthOffset) {
    var now = new Date();
    var currentYear = now.getFullYear();
    var currentMonth = now.getMonth();

    // The Date constructor automatically handles year rollover when the month index is outside 0-11.
    return new Date(currentYear, currentMonth + monthOffset, 1);
}

function generateCalendarTable(highlightedDates = [], selectedDate) {
    let targetDate;
    
    // --- NEW LOGIC: Determine the target month and year ---
    if (highlightedDates && highlightedDates.length > 0) {
        // Use the first date in the array to determine the month/year.
        const dateParts = highlightedDates[0].split('-').map(p => parseInt(p, 10));
        // Date constructor: new Date(year, monthIndex, day)
        targetDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
    } else {
        // Default to the current month if no dates are provided
        targetDate = new Date(selectedDate);
    }
   // alert(targetDate);
    // Set the first day of the target month (day 1)
    const firstDayOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
	const monthIndex = firstDayOfMonth.getMonth();
    // --- END NEW LOGIC ---
 // --- Calculate Navigation Dates for Prev/Next Month ---
    
    // Previous Month
    const prevMonthStart = new Date(firstDayOfMonth.getFullYear(), monthIndex - 1, 1);
    const prevMonthEnd = new Date(firstDayOfMonth.getFullYear(), monthIndex, 0); 
    const prevMonthName = prevMonthStart.toLocaleString('en-US', { month: 'long' });
    const prevMonthStartDateString = formatDate(prevMonthStart);
    const prevMonthEndDateString = formatDate(prevMonthEnd);

    // Next Month
    const nextMonthStart = new Date(firstDayOfMonth.getFullYear(), monthIndex + 1, 1);
    const nextMonthEnd = new Date(firstDayOfMonth.getFullYear(), monthIndex + 2, 0);
    const nextMonthName = nextMonthStart.toLocaleString('en-US', { month: 'long' });
    const nextMonthStartDateString = formatDate(nextMonthStart);
    const nextMonthEndDateString = formatDate(nextMonthEnd);
    
    // --- End Navigation Date Calculation ---
    const year = firstDayOfMonth.getFullYear();
    // 0 (Sunday) to 6 (Saturday) - determines the starting cell for day '1'
    const startingDayOfWeek = firstDayOfMonth.getDay();
    
    // Get the last day of the month by getting day '0' of the next month.
    const daysInMonth = new Date(year, firstDayOfMonth.getMonth() + 1, 0).getDate();

    // Create a Set for efficient lookup of dates to highlight
    const highlightSet = new Set(highlightedDates);

    // Get month name for the header
    const monthName = firstDayOfMonth.toLocaleString('en-US', { month: 'long' });

    // Inject self-contained CSS for styling (replaces all Tailwind classes)
    let cssStyles = `
        <style>
			.rowHide {
				max-height: 0px;
				visibility: collapse;
			}
			.rowShow{
				visibility:initial;
			}
			.calendar-nav-container {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 1rem;
                padding: 0 10px;
            }
            .calendar-nav-link {
                color: #666666 !important; /* blue */
                font-size: 16px !important;
                text-decoration: none; /* optional */
            }
            .calendar-nav-link:hover {
                color: #000000 !important; /* keeps blue on hover */
            }    
            .calendar-month-view { 
                width: 100%; 
                border-collapse: collapse; 
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
                border-radius: 8px;
                overflow: hidden; /* Ensures rounded corners on content */
                background-color: #F6F6F6;
                font-family: Arial, sans-serif;
            }
            .calendar-header-title {
                font-size: 20px !important;
                font-weight: 600 !important;
                color: #CD2996 !important;
                margin-bottom: 1rem;
                text-align: center;
                padding-top: 5px;
            }
            .calendar-month-header {
                background-color: #ffffffff;
                color: black;
            }
            .calendar-day-header {
                padding: 12px;
                font-weight: 600; /* font-semibold */
                font-size: 0.875rem; /* text-sm */
                text-align: center; /* center headers like the dates */
                vertical-align: middle; /* keep consistent alignment */
            }
            .calendar-cell { /* disable dates */
                padding: 12px;
                height: 48px;
                color: #CFD0D3; 
                border: 1px solid #e5e7eb; /* Gray-200 */
                text-align: center;
                font-size: 0.875rem; /* text-sm */
                
            }
            .calendar-cell:hover:not(.calendar-padding-cell) {
                
            }
            .calendar-padding-cell {
                background-color: #F6F6F6; /* Gray-100 */
                cursor: default;
            }
            .calendar-today,
            .calendar-today:hover,
            .calendar-today:focus {
                font-weight: 700 !important;
                background-color: #CD2996 !important;
                color: white !important;
                border: none !important;
                cursor: default !important;
                box-shadow: none !important;
            }
            .calendar-highlight {
                /* Inline styles handle this: background-color: green; color: white; */
                font-weight: 700; /* font-bold */
				cursor:pointer;
            }
            .calendar-highlight a {
                /* Ensures link fills cell */
                display: block;
                width: 100%;
                height: 100%;
                text-decoration: none;
                color: inherit;
            }
            /* Hover for highlighted cells that are NOT today */
            .calendar-highlight:not(.calendar-today):hover {
                background-color: #FFD4E8 !important;
            }

            /* Styles for today (active) */
            .calendar-today,
            .calendar-today:hover {
                background-color: #CD2996 !important;
                color: white !important;
                font-weight: 700 !important;
                border: none !important;
                cursor: default !important;
}
        </style>
    `;

    let tableHTML = cssStyles;
    
	 // --- NAVIGATION AND TITLE HEADER ---
    tableHTML += `
        <div class="calendar-nav-container">
            <!-- Left Navigation (Previous Month) -->
            <a href="#" onclick="dk_calnav('${prevMonthStartDateString}', '${prevMonthEndDateString}'); return false;" 
               class="calendar-nav-link">
                &lt; ${prevMonthName}
            </a>

            <!-- Title -->
            <h2 class="calendar-header-title">${monthName} ${year}</h2>

            <!-- Right Navigation (Next Month) -->
            <a href="#" onclick="dk_calnav('${nextMonthStartDateString}', '${nextMonthEndDateString}'); return false;" 
               class="calendar-nav-link">
                ${nextMonthName} &gt;
            </a>
        </div>
    `;
    // --- END NAVIGATION AND TITLE HEADER ---
	
    tableHTML += '<table class="calendar-month-view">';

    // Row 1: Day Headers (Su, Mo, Tu, We, Th, Fr, Sa)
    tableHTML += '<thead class="calendar-month-header">';
    tableHTML += '<tr>';
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayHeaders.forEach(day => {
        tableHTML += `<th class="calendar-day-header">${day}</th>`;
    });
    tableHTML += '</tr>';
    tableHTML += '</thead>';

    tableHTML += '<tbody>';

    let dayCount = 1;

    // Loop through a maximum of 6 weeks
    for (let i = 0; i < 6; i++) {
        // If we've exceeded the number of days in the month, stop generating rows
        if (dayCount > daysInMonth && i > 0) break;
        
        tableHTML += '<tr>';

        for (let j = 0; j < 7; j++) { // 7 days in a week
            let cellContent = '';
            let cellClass = 'calendar-cell';
            let inlineStyle = ''; // Used for explicit color changes

            // 1. Padding cells before the 1st day of the month
            if (i === 0 && j < startingDayOfWeek) {
                cellContent = ''; // Empty cell
                cellClass += ' calendar-padding-cell'; // Gray out non-month days
            }
            // 2. Cells for the actual days of the month
            else if (dayCount <= daysInMonth) {
                
                // Get the current day's full date for comparison
                const cellDate = new Date(year, firstDayOfMonth.getMonth(), dayCount);
                const cellDateString = formatDate(cellDate);
                const isHighlighted = highlightSet.has(cellDateString);

                // Highlight today's date if it matches the current month/year
                const today = new Date(selectedDate);
                const isToday = today.getDate() === dayCount &&
                                today.getMonth() === firstDayOfMonth.getMonth() &&
                                today.getFullYear() === firstDayOfMonth.getFullYear();

                // --- HIGHLIGHTING AND LINK LOGIC ---
                if (isHighlighted) {
                    // Apply inline style as requested (background green, font white)
                    inlineStyle = 'background-color: #ffffffff; color: #CD2996;';
                    cellClass += ' calendar-highlight';
                    
                    // Wrap the day number in a link
                    cellContent = `<a onclick="dk_selDate('${cellDateString}')" style="color: inherit;">${dayCount}</a>`;

                } else {
                    cellContent = dayCount;
                }
                
                // Apply 'today' styling last, as it takes precedence
                if (isToday) {
                    // Note: If a date is highlighted AND today, the inline green/white will override the background but the border will apply.
                    cellClass += ' calendar-today';
                    // We need to re-wrap the content if it wasn't a link already, to make sure it's bolded/styled correctly
                    if (!isHighlighted) {
                         cellContent = dayCount; // Keep as text, style via class
                    }
                }
                
                dayCount++;
            }
            // 3. Padding cells after the last day of the month
            else {
                cellContent = ''; // Empty cell
                cellClass += ' calendar-padding-cell'; // Gray out non-month days
            }

            tableHTML += `<td class="${cellClass}" style="${inlineStyle}">${cellContent}</td>`;
        }
        tableHTML += '</tr>';
    }

    tableHTML += '</tbody></table>';
    return tableHTML;
}

function dk_selDate(seldate) {
	jQuery(document).ready(function($) {
	var queryString = window.location.search;
	var urlParams = new URLSearchParams(queryString);
	urlParams.set('d_sel', seldate);
	$("#dk-loading-overlay").addClass("is-active");
	window.location.search = urlParams;
})
}
	
</script>
<?php
   
}
add_action('wp_head', 'dk_javascript');

/**
 * Legacy shortcode to build course instance list.
 * NOTE: This functionality is likely replaced by the main plugin's [dk_calendar] shortcode.
 * 
 * Usage: [dk-workshops]
 */
function dk_build_instancelist($atts)
{
	
	$dk_course_id = $_GET['c_id']; // Get the course ID from the URL
	$dk_location_name = $_GET['l_name']; // Get the location name from the URL
	
	//override_instance_limit=3 - is a potential variable to restrict list
	
	$dk_shortcode = '[ax_course_instance_list override_instance_limit=1600 show_full_instances=1 course_type=w style=ax-table'; //set start of shortcode
	
	if ($dk_course_id){  //if the course id has been passed add the filter for course
		$dk_shortcode .= ' course_id='.$dk_course_id;
	}
	
	if ($dk_location_name){  //if the course id has been passed add the filter for course
		$dk_shortcode .= ' location='.$dk_location_name;
	}
	
	$dk_shortcode .= ' ]';
		
	return do_shortcode($dk_shortcode);
	
}

add_shortcode('dk-workshops', 'dk_build_instancelist');
