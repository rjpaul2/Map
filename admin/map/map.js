/**test with XXX/AdminMap/index.html?env=dev&t=en6qaii2abo9i44fpbfdc4f4u3&email=contacto%40tuten.cl
 * or login with with XXX/AdminMap/index.html?env=dev*/
var hidePanel = true;
var markersOnMap = []; /*All current markers on the map*/
var bounds = null; /*Bounds of the map, given marker location -- used for centering map */
var dateBoxesEnabled = true;
var validJobsChecked = false;
var showDataChecked = false;
var intervalListener; /*The interval listener for updating pro's jobs, need to clear this on every request*/
var alreadyWarned = [];
var done = false; /*true when filter and import is complete*/

var REFRESH_INTERVAL = 5000; /*Change this to change the refresh rate of the pros' positions. Originally set to 5000 milliseconds -- careful with overflowing directions requests*/
var PRO_MARKER_SIZE = 30;
var CLIENT_MARKER_SIZE = 25;

function initMap(){
	env = getEnv();
	if(env != '')/*Warn to make sure the user entered his environment parameters correctly*/
		console.warn("WARNING: Fetching from environment of type: " + env.toUpperCase() + "...Make sure this is a valid environment for FETCH")
		
	/*Decide which panel to initially show based on passed token*/
	if(!getToken()){
		console.warn("WARNING: Could not find TOKEN");
		$("#filterPanel").hide();}
	else{/*Show Filter Panel with animation and unhide element*/
		$("#loginPanel").hide();
	}
	setTimeout(function(){$("#panel").show("slow");document.getElementById("panel").style.overflow = "auto";document.getElementById("panel").style.display = "inline";},1000);
		
	/*Make our map at the default Santiago coordinates*/
	var map = document.getElementById('map');
	
	var	map = new google.maps.Map(map, {
		center : {lat: -33.4489, lng: -70.6693},
		zoom : 13,
		mapTypeId: google.maps.MapTypeId.ROADMAP,
		disableDefaultUI: true
	});	
	
	/*Set up moment*/
	moment().format();

	//findClientLoc(map);
	//findAndRefreshProLoc(map); /*Update Pro's location at the rate specified by the back-end*/
	
	setTimeout(function(){enableControls(map);},2500);/*Enable filtering and login controls*/

	setTimeout(function(){appendIcon(map);}, 1000);/*For appearance*/
	
	/*Trigger map-centering during resize of window*/
	google.maps.event.addDomListener(window, "resize", function() {
		if(bounds)
			map.fitBounds(bounds);
	    });
	/*Get initial bounds*/
	bounds = map.getBounds();
	/*Optionally style the map (more options of style available in the code*/
	styleMap(map);
	/*Define certain panel elements On-click actions*/
	document.getElementById("filterButton").onclick = function(){filterButton(map)};
	document.getElementById("validJobs").onclick = function(){/*disable date box on clicking only valid jobs*/
		if(document.getElementById("validJobs").checked == true){
			document.getElementById("to").disabled = true;
			document.getElementById("from").disabled = true;
		}
		else{
			document.getElementById("to").disabled = false;
			document.getElementById("from").disabled = false;
		}
			
	}
	/*Fixes small bug (takes two clicks on the first try to interact with panel)*/
	setTimeout(function(){document.getElementById("panelButton").click();}, 3000);
}

/**Called by pressing the "Login" Button
 * This PUTS the information and returns the token, then refreshes the page with that token
 * Else flashes an error to try again**/
function loginButton(){
	$("body").css("cursor", "progress");/*Make cursor Load*/
	$.ajax({
		type: 'PUT',
		url: "http://" + getEnv() + "tuten.cl:80/TutenREST/rest/user/" + getEmail(), 
		dataType: "json",
		beforeSend: function(xhr){/*Set header parameters*/
		    xhr.setRequestHeader('password', getPassword());
		    xhr.setRequestHeader('app', 'APP_BCK');
		},
		success: function(response){/*On success Refresh the page showing filter panel*/
			var url = window.location.href;
			if(url.substr(url.length - 1) == "l" || url.substr(url.length - 1) == "/" || url.substr(url.length - 1) == "n" || url.substr(url.length - 1) == "p")/*Add ? if ends in ".html" or "admin/" or "map/" or "admin" or "map", otherwise, assume parameters*/
				url = url + '?'	
			window.location.href = url + "&t=" + response.sessionTokenBck + "&email=" + getEmail(); /*Refresh to page with token and email*/
		},
		error: function(){
			$("body").css("cursor", "default");/*Change cursor back to normal*/
			errorMsg("Invalid Email/Password", "-290px", "loginPanel");/*Display error message*/
		}
	});
	/*Gets the inputed email and replaces "@" with "%40" NOTE: there are two different getEmail functions (one from url, one from login box)*/
	function getEmail(){
		var insertPos;
		var email = document.getElementById("email").value;
		for(i = 0; i < email.length; i++)
			if(email[i] == "@")
				insertPos = i;
		if(insertPos == null)
			return false;
		return [email.slice(0, insertPos), "%40", email.slice(insertPos + 1)].join(''); /*Put it in the ex. contacto%40tuten.cl format and return*/
	}
	function getPassword(){
		return document.getElementById("password").value;
	}
}

/**Response on clicking the Filter Button (a lot happens*/
function filterButton(map){
	/*Prevent button spamming*/
	document.getElementById("filterButton").disabled = true;
	document.getElementById("filterButton").style.opacity = "0.3";
	done = false;

	if(intervalListener)clearInterval(intervalListener)
	validJobsChecked = document.getElementById("validJobs").checked;
	showDataChecked = document.getElementById("data").checked;
	$('.notifyjs-corner').empty(); /*Clear old lateness notifications*/
	$("body").css("cursor", "progress");/*Make cursor Load*/	
	/*Get response header and send it through the filterAndImport function on success*/
	getDataResponseBody(function(response){
		if(errorText)/*Remove error message*/
			errorText.remove();
		$("body").css("cursor", "default");
		filterAndImport(map, response); /**HUGE FUNCTION*/
	});	
}
/**Parses the original body and also the markers on the map Array, finds similarities in jobId, and updates the positions of all pros
 * This is to be used on a set interval, to constantly update the pros' positions**/
var responseBody = [];
function updateProLocs(markersOnMap){
	$.when(getDataResponseBody(function(response){/*.when we actually update the response,...*/
		responseBody = response.slice();
	})).then(function(){
		if(responseBody.length > 0)
			for(i = 0; i < responseBody.length; i++)
				for(j = 0; j < markersOnMap.length; j++)
					if(markersOnMap[j].client == false)/*Only update pro markers*/
						if(markersOnMap[j].jobID == responseBody[i].jobID){
							newLoc = new google.maps.LatLng(responseBody[i].professionalS, responseBody[i].professionalW)
							markersOnMap[j].marker.setPosition(newLoc);	
							markersOnMap[j].proLoc = newLoc;
						}
	});
}
var firstTime = true;
/**Fetches client/pro info from back end by means of the GET operation and returns the object
 * executes success function on success, error function on failure of fetch**/
function getDataResponseBody(success){
	/**Gets the email form URL NOTE" there are two different email functions, the other one get's it from the login box**/
	function getEmail(){
		var insertPos;
		var query = window.location.search.substring(1); /*Everything after '?' i.e. "t=TOKEN&email=contacto@tuten.cl..."*/
		var query_array = query.split(/&|=/);/*Array like {t, TOKEN, email, contacto@tuten.cl...}*/
		var email = false;
		for(i = 0; i < query_array.length; i++){
			if(query_array[i] == 'email')
				email = query_array[i+1]; /*token gets the next element in the array*/
		}	
		if(!email)
			return false;
		for(i = 0; i < email.length; i++){
			if(email[i] == "%" && email[i+1] == "4" && email[i+2] == "0")
				insertPos = i;
		}
		return [email.slice(0, insertPos), "@", email.slice(insertPos + 3)].join(''); /*Put it in the ex. contacto@tuten.cl format and return*/
	}
	/**Gets the date from the form, given input 'to' or 'from', changes to the appropriate format (DD-MM-YYYY), and returns. Return false if invalid something**/
	/*TODO: This only works from format YYYY-MM-DD, the "getElementById" might be different depending on the web browser causing errors*/
	function getDate(arg){
		/*Today's date is useful if we want all current jobs*/
		function getTodaysDate(){
			var today = new Date();
			var dd = today.getDate();
			var mm = today.getMonth() + 1;
			var yyyy = today.getFullYear() + 1;/*One year in advance (to make sure we get all jobs)*/
			if(dd<10)dd = '0'+ dd;
			if(mm<10)mm = '0' + mm;
			return dd + "-" + mm + "-" + yyyy;
		}
		var date = false;
		switch(arg){
		case 'from':
			if(validJobsChecked)return "01-01-2014";/*If we just need the valid jobs, return an appropriate range of dates of possible valid jobs*/
			date = document.getElementById("from").value;break;
		case 'to':
			if(validJobsChecked)return getTodaysDate();
			date = document.getElementById("to").value;break;			
		default:
			return false;
		}
		if(date == "")
			return false;
		/*At this point the date format should look like: YYYY-MM-DD*/
		year = date.substring(0,4);
		month = date.substring(5,7);
		day = date.substring(8,10);
		return day + "-" + month + "-" + year;
	}
	/*If there's some sort of error by the user in entering the dates, and this is the first time this function had run*/
	if((!getDate('to') || !getDate('from')) && !validJobsChecked && firstTime){
		errorMsg("Enter Valid Date", "0px", "shade");
		bounds = null;
		$("body").css("cursor", "default");
		if(intervalListener)clearInterval(intervalListener);
		document.getElementById("filterButton").disabled = false;
		document.getElementById("filterButton").style.opacity = "1.0";return;}
	if(!getEmail()){
		errorMsg("No email pararmeter -- Try logging in", "0px", "shade");
		bounds = null;
		$("body").css("cursor", "default");
		document.getElementById("filterButton").disabled = false;return;}
	/*Meat of this function*/
	$.ajax({
		type: "GET",
		url: 'http://' + getEnv() + 'tuten.cl:80/TutenREST/rest/booking/map/all?from=' + getDate('from') + "&to=" + getDate('to'),
		dataType: "json",
		beforeSend: function(xhr){
			xhr.setRequestHeader('app', 'APP_BCK');
			xhr.setRequestHeader('token', getToken());
			xhr.setRequestHeader('email', getEmail());
		},
		success: success,
		error:
		function(){
			errorMsg("Whoops, something went wrong", "0px", "shade");
			$("body").css("cursor", "default");/*Set cursor back to normal (from loading)*/	
			document.getElementById("filterButton").disabled = false;
			document.getElementById("filterButton").style.opacity = "1.0"
		}
	});
}
/*Called by filterButton() on success of REST GET, filters response array by info specified by user and returns that array to be imported to the map*/
function filterAndImport(map, response){
	bounds = new google.maps.LatLngBounds();
	var proIcon;
	var proLoc;
	var clientLoc;
	/*Grab check box variables from document*/
	var cleaning = document.getElementById("cleaning");
	var electric = document.getElementById("electric");
	var gas = document.getElementById("gas");
	var special = document.getElementById("specialists");
	var routes = document.getElementById("routes");
	
	filtered = [];
	if(response.length == 0){
		errorMsg("No data within specified dates", "0px", "shade");bounds = null;document.getElementById("filterButton").disabled = false;document.getElementById("filterButton").style.opacity = "1.0";return;
	}
	/*Test data*/
//	response = [
//	           {
//                "professionalS": -33.4585,
//                "professionalW": -70.6693,
//                "clientS": -33.4491,
//                "clientW": -70.9694,
//                "jobID": 1,
//                "clientName": "John Doe",
//                "proName": "Jane Doe",
//                "secondsInterval": 0,
//                "validJob": false,
//                "jobType": "PRO_CLEAN"
//	           },
//	           {
//                "professionalS": -33.4480,
//                "professionalW": -70.6499,
//                "clientS": -33.4490,
//                "clientW": -70.6092,
//                "jobID": 2,
//                "clientName": "Kevin Doe",
//                "proName": "Josh Doe",
//                "secondsInterval": 0,
//                "validJob": true,
//                "jobType": "JOB_ELECTRIC"
//	           },
//	           {
//                "professionalS": -33.4389,
//                "professionalW": -70.6689,
//                "clientS": -33.4990,
//                "clientW": -70.6399,
//                "jobID": 3,
//                "clientName": "Bob Doe",
//                "proName": "Vicky Doe",
//                "secondsInterval": 0,
//                "validJob": false,
//                "jobType": "JOB_GAS"
//	           },
//	           {
//                "professionalS": -33.4486,
//                "professionalW": -70.6790,
//                "clientS": -33.4480,
//                "clientW": -70.6000,
//                "jobID": 4,
//                "clientName": "Paul Doe",
//                "proName": "Frank Doe",
//                "secondsInterval": 0,
//                "validJob": false,
//                "jobType": "JOB_SPECIAL"
//	           }
//	          ];
	/*FILTERING PROCESS*/
	/*If we just want valid jobs, filter only those jobs, else filter by date -- add the "&& response[i].validJob" condition*/
	if(validJobsChecked){
		for(i = 0; i < response.length; i++){
			/*Listed from most used job first, and searching if it's checked second, for maximum efficiency algorithm*/
			if(response[i].jobType.substring(0,9) == "PRO_CLEAN" && cleaning.checked && response[i].validJob)
				filtered.push(response[i]);
			else if(response[i].jobType.substring(0,8) == "PRO_ELEC" && electric.checked && response[i].validJob)
				filtered.push(response[i]);
			else if(response[i].jobType.substring(0,9) == "PRO_PLUMB" && gas.checked && response[i].validJob)
				filtered.push(response[i]);
			else if(response[i].jobType.substring(0,9) == "PRO_HANDY" && special.checked && response[i].validJob)
				filtered.push(response[i]);
		}
	}
	else{/*Search through response body and add elements to filtered[] based on if it's checked and if if we are currently looking at the specified jobType*/
		for(i = 0; i < response.length; i++){
			/*Listed from most used job first, and searching if it's checked second, for maximum efficiency algorithm*/
			if(response[i].jobType.substring(0,9) == "PRO_CLEAN" && cleaning.checked)
				filtered.push(response[i]);
			else if(response[i].jobType.substring(0,8) == "PRO_ELEC" && electric.checked)
				filtered.push(response[i]);
			else if(response[i].jobType.substring(0,9) == "PRO_PLUMB" && gas.checked)
				filtered.push(response[i]);
			else if(response[i].jobType.substring(0,9) == "PRO_HANDY" && special.checked)
				filtered.push(response[i]);
		}
	}
	/*Error message if filtering nothing*/
	if(filtered.length == 0 && markersOnMap.length == 0){
		errorMsg("Nothing to Filter", "0px", "shade");bounds = null;document.getElementById("filterButton").disabled = false;document.getElementById("filterButton").style.opacity = "1.0";return;
	}
	/*filtered[] now has the contents we need*/
	/*IMPORTNG PROCESS*/
	if(markersOnMap.length > 0){/*Remove all previously filtered markers on the map*/
		for(i = markersOnMap.length - 1; i >= 0; i--){
			google.maps.event.clearInstanceListeners(markersOnMap[i].marker);
			if(markersOnMap[i].infoWindow)google.maps.event.clearInstanceListeners(markersOnMap[i].infoWindow);
			markersOnMap[i].marker.setMap(null);
			markersOnMap.pop();}
		markersOnMap = [];
	}
	/*If there's already directions showing, clear them*/
	if(directionsDisplays){/*Remove displayed directions from map*/
		for(i = 0; i < directionsDisplays.length; i++)
			directionsDisplays[i].setMap(null);
		if(filtered.length == 0){bounds = null;document.getElementById("filterButton").disabled = false;document.getElementById("filterButton").style.opacity = "1.0";return;} /*Nothing to do, so we just act as if we simply cleared the map*/
	}
	/*Prevent Spamming of button*/
	var tmp = setInterval(function(){
		if(done == true){
			document.getElementById("filterButton").disabled = false;
			document.getElementById("filterButton").style.opacity = "1.0";
			clearInterval(tmp);
		}
	},1000)
	
	/*Remove all previous warnings*/
	if(alreadyWarned){
		for(i = 0; i < alreadyWarned.length; i++)
			alreadyWarned.pop();
		alreadyWarned = [];
	}
		
	for(i = 0; i < filtered.length; i++){
		/*Here, we're assuming the clients LatLng is ALWAYS going to be valid, so no need to check validity (this is an important assumption for showing routes later)*/
		clientLoc =  new google.maps.LatLng(filtered[i].clientS, filtered[i].clientW);
		/*Drop animation on first time, also extend bounds for centering*/
		markersOnMap.push({marker: createMarker(map, clientLoc, "Client", google.maps.Animation.DROP, "img/tuten-icon.png", CLIENT_MARKER_SIZE, "Client: " + filtered[i].clientName + "<br>Job ID: " + filtered[i].jobID, true), validJob: filtered[i].validJob, client: true, jobID: filtered[i].jobID, name: filtered[i].clientName, jobType: null, proLoc: null, clientLoc: clientLoc, ETA: null, infoWindow: null, showInfo: true, bookingTime: null, late: null, iconColor: "blue", clicked: false});
		bounds.extend(clientLoc);

		/*Import pro makers*/
		if(filtered[i].professionalS && filtered[i].professionalW){/*Make sure professional marker exists*/
			/*Choose appropriate icon for pro based on job*/
			switch(filtered[i].jobType){
				case "JOB_CLEAN": proIcon = "img/clean-icon.png";break;
				case "JOB_ELECTRIC": proIcon = "img/electric-icon.png";break;
				case "JOB_GAS": proIcon = "img/gas-icon.png"; break;
				case "JOB_SPECIAL": proIcon = "img/fix-icon.png"; break;
				default: console.warn("WARNING: Can't find job of: " + filtered[i].proName + " Using car icon"); proIcon = "img/car-icon-black.png"; break;				
			}
			proLoc = new google.maps.LatLng(filtered[i].professionalS, filtered[i].professionalW); 
			/*Drop animation on firstTime, also extend bounds for centering*/
			markersOnMap.push({marker: createMarker(map, proLoc, "Profesional", google.maps.Animation.DROP, proIcon, PRO_MARKER_SIZE, "Pro: " + filtered[i].proName + "<br>Job ID: " + filtered[i].jobID + "<br> Start Time: " + "<br>ETA: ", false), validJob: filtered[i].validJob, client: false, jobID: filtered[i].jobID, name: filtered[i].proName, jobType: filtered[i].jobType, proLoc: proLoc, clientLoc: clientLoc, ETA: 0, infoWindow : null, showInfo: true, bookingTime: filtered[i].bookingTime, late: false, iconColor: "black", clicked: false});
			//setETA(proLoc, clientLoc, markersOnMap, i);
			bounds.extend(proLoc);
			if(routes.checked)/*Route directions if this is what the user has chosen, only due this the first time this function executes for speed*/
				getDirections(map, clientLoc, proLoc);	
		}
	}
	/*Center the map given the panel after directions are found*/
	setTimeout(function(){
		google.maps.event.trigger(map, "resize");
		if(bounds)map.fitBounds(bounds);
	}, 200);
	/*Update all pros positions every 2000 milliseconds*/
	var refreshFunction = function(){updateProLocs(markersOnMap);updateETAs(map, markersOnMap);analyzeLateness(map);};
	/*Call refreshFunction originally to get page loaded more quickly -- Wait for everything to settle before trying to use it*/
	var count = 0;
	var temp = setInterval(function(){
		if(count<2){
			refreshFunction();}
		else{
			clearInterval(temp);}
		count++;
	},1000);
	intervalListener = setInterval(refreshFunction, REFRESH_INTERVAL);
}
var directionsDisplays = []; 
var directionsService;
/**Finds and displays directions based on the global clientLoc and proLoc**/
function getDirections(map, clientLoc, proLoc){
	var directionsDisplay;
	directionsService = new google.maps.DirectionsService();
	
	/*Define directions request*/
	var request = {
		origin: proLoc,
		destination: clientLoc,
		travelMode: google.maps.DirectionsTravelMode.DRIVING /*For simplicity we're assuming the pro's are driving*/
	};
	/*Create a renderer for directions and bind it to the map*/
	var rendererOptions = {
		map: map,
		suppressMarkers: true,
		preserveViewport: true,
		polylineOptions: {
		      strokeColor: "#56c5c7",/*Tuten colors*/
		      strokeWeight: 5
		    }
	}
	directionsDisplay = new google.maps.DirectionsRenderer(rendererOptions);
	/*Issue a directions search request, do some error handling*/
	directionsService.route(request, function(response, status){
		if(status == google.maps.DirectionsStatus.OK)
			directionsDisplay.setDirections(response);	
	});	
	//directionsDisplay.setMap(map);
	directionsDisplays.push(directionsDisplay); /*Add to global array to keep track of routes displayed on the map*/
}
var alreadyWarned = [];
/**Sets the Google Maps ETA (in seconds) in the markersOnMap structure from one point to another ASSUMING PUBLIC TRANSPORTATION*/ 
function setETA(proLoc, clientLoc, markersOnMap, index){
	if(proLoc && clientLoc){
		var duration = 0;
		dS = new google.maps.DirectionsService();
		/*Define directions request*/
		var request = {
			origin: proLoc,
			destination: clientLoc,
			travelMode: google.maps.DirectionsTravelMode.TRANSIT /*TODO: WE'RE ASSUMMING PUBLIC TRANSPORTATION FOR ETA TIME -- NEED TO FIGURE OUT A WAY TO CHANGE THIS*/
		};
		dS.route(request, function(response, status){
			if(status == google.maps.DirectionsStatus.OK){
				legs = response.routes[0].legs;
				/*Just in case we have way points, parse through all legs and add it to duration*/
				for(i = 0; i < legs.length; i++)
					duration += legs[i].duration.value;
				markersOnMap[index].ETA = duration;
			}
			else{
				for(i = 0; i < alreadyWarned.length; i++)
					if(alreadyWarned[i] == markersOnMap[index].jobID)
						return;/*We already warned the user about this, simply return*/
				
				alreadyWarned.push(markersOnMap[index].jobID)
				$.notify("JobID: " + markersOnMap[index].jobID + " returned \nDIRECTIONSSTATUS = " + status + "\n ETA Approximation could be scewed", {position: "bottom left", className: "warn", autoHide: true, autoHideDelay: REFRESH_INTERVAL});
			}
		});	
	}
	else
		return 0;
}
/**Updates both the infoWindow ETA variables and the markerOnMap structure ETAs for the pros' positions*/
function updateETAs(map, markersOnMap){
	for(i = 0; i < markersOnMap.length; i++){
		setETA(markersOnMap[i].proLoc, markersOnMap[i].clientLoc, markersOnMap, i);/*Update ETAs in structure*/
		if(!markersOnMap[i].client && markersOnMap[i].validJob){/*Only update pro markers that are in a currently open job (else, the ETA field of the infoWindow will just be blank)*/
			/*If the infoWindow is open, mess with the infoWindow*/
			if(markersOnMap[i].showInfo){
				var markerClicked = false;
				/*Make a new info window with new data*/
				var infoWindow = new google.maps.InfoWindow({
					content: "Pro: " + markersOnMap[i].name + "<br>Job ID: " + markersOnMap[i].jobID + "<br> Start Time: " + secondsToTime2(markersOnMap[i].bookingTime) + "<br>ETA: " + secondsToTime(markersOnMap[i].ETA) + " (" + Math.floor(markersOnMap[i].ETA/60) + " MIN)"
				});
				/*Remove the previous infoWindow along with any listeners to that window*/
				if(markersOnMap[i].infoWindow){
					google.maps.event.clearInstanceListeners(markersOnMap[i].infoWindow);
					markersOnMap[i].infoWindow.close();
				}
				/*Update infoWindow*/
				markersOnMap[i].infoWindow = infoWindow;
					
				var marker = markersOnMap[i].marker
				google.maps.event.addListener(marker, 'click', function(){/*Same functionality as before*/
					for(j = 0; j < markersOnMap.length; j++){
						if(marker == markersOnMap[j].marker){
							markersOnMap[j].infoWindow.open(marker.get('map'), marker)
							map.panTo(marker.getPosition());
							markersOnMap[j].showInfo = true;
							markersOnMap[j].clicked = true;
						}
					}
				});
				/*Make sure the infoWindow doesn't keep reappearing if the user closes it*/
				google.maps.event.addListener(infoWindow,'closeclick',function(){
					for(i = 0; i < markersOnMap.length; i++)
						/*Search for the correct info window and change the markersOnMap properties so we don't loop back into the loop (the infoWindow stays closed*/
						if(markersOnMap[i].infoWindow == infoWindow){
							markersOnMap[i].showInfo = false;
							markersOnMap[i].clicked = false;
						}
				});
				/*If the user checked "Show Data" or the marker is currently clicked, keep data showing*/
				if(showDataChecked || markersOnMap[i].clicked)infoWindow.open(map, markersOnMap[i].marker);/*Open infoWindow*/
			}
		}		
	}
	/**Converts seconds into time of arrival string**/
	function secondsToTime(ETA){
		var unixTime = new Date().getTime() + (ETA*1000); /*Unix Time in seconds when the pro will arrive*/
		return moment(unixTime).format('lll'); //e.g. Aug 9, 2016 12:01 PM
	}
	/**Converts seconds into raw time and date**/
	function secondsToTime2(ETA){
		var unixTime = new Date(ETA);
		return moment(unixTime).format('lll');
	}
}
/**Alerts user is specific pro is late to his/her service**/
function analyzeLateness(map){
	/**Gets the email form URL NOTE" there are two different email functions, the other one get's it from the login box**/
	function getEmail(){
		var query = window.location.search.substring(1); /*Everything after '?' i.e. "t=TOKEN&email=contacto@tuten.cl..."*/
		var query_array = query.split(/&|=/);/*Array like {t, TOKEN, email, contacto@tuten.cl...}*/
		var email = false;
		for(i = 0; i < query_array.length; i++)
			if(query_array[i] == 'email')
				email = query_array[i+1]; /*token gets the next element in the array*/
		return email;
	}
	$.ajax({
		type: "GET",
		url: 'http://' + getEnv() + 'tuten.cl:80/TutenREST/rest/params/' + getEmail() + '?key=MINUTES_FOR_ETA_LIMIT',
		dataType: "json",
		beforeSend: function(xhr){
			xhr.setRequestHeader('app', 'APP_BCK');
			xhr.setRequestHeader('token', getToken());
		},
		success: function(jd){
			/**Here, we're going to use:
			 * ETA > (S + P) - A
			 * 	S = Booking start time
			 * 	P = Parameter with constant to add (in minutes)
			 * 	A = Actual time
			 * in order to see if a pro is late **/
			for(i = 0; i < markersOnMap.length; i++){
				if(!markersOnMap[i].client){
//					alert(markersOnMap[i].ETA * 1000);
//					alert(markersOnMap[i].bookingTime);
//					alert(jd.paramValue * 60 * 1000);
//					alert(new Date().getTime());			
					if((markersOnMap[i].ETA * 1000) > ((markersOnMap[i].bookingTime + (jd.paramValue * 60 * 1000)) - new Date().getTime())){
						markersOnMap[i].late = true;
					}
					else
						markersOnMap[i].late = false;
				}
			}
		}
	});
	/*TODO: Parse through markersOnMap and change late pros' icons to red if late and back to black if back on time*/
	for(i = 0; i < markersOnMap.length; i++){
		if(!markersOnMap[i].client){
			/* If we are looking at a pro, the pro is late, the job is active, and the icon hasn't already been changed...*/
			if(markersOnMap[i].late == true && markersOnMap[i].iconColor == "black" && markersOnMap[i].validJob){
				markersOnMap[i].iconColor = "red"
				markersOnMap[i].marker.setMap(null);markersOnMap[i].marker = null;
				/*Find the correct icon in order to create the new marker*/
				switch(markersOnMap[i].jobType){
					case "JOB_CLEAN": proIcon = "img/clean-icon-red.png";break;
					case "JOB_ELECTRIC": proIcon = "img/electric-icon-red.png";break;
					case "JOB_GAS": proIcon = "img/gas-icon-red.png"; break;
					case "JOB_SPECIAL": proIcon = "img/fix-icon-red.png"; break;
					default: proIcon = "img/car-icon-red.png"; break;				
				}
				/*Pop up small notification on the bottom left corner if pro becomes late and if ETA is calculated correctly*/
				if(markersOnMap[i].ETA != 0)
					$.notify(markersOnMap[i].name + " (JobID: " + markersOnMap[i].jobID + ") is late!", {position: "bottom left", className: "error", autoHide: false});
				markersOnMap[i].marker = createMarker(map, markersOnMap[i].proLoc, "Profesional", null, proIcon, PRO_MARKER_SIZE, "Pro: " + markersOnMap[i].name + "<br>Job ID: " + markersOnMap[i].jobID + "<br> Start Time: " + "<br>ETA: ", false)
				
			}
			/* If we are looking at a pro, the pro is back on time, and the icon hasn't already been changed back... (TODO: VERY RARE CASE -- HARD TO TEST)*/
			else if(markersOnMap.late == false && markersOnMap[i].color == "red" && markersOnMap[i].validJob){
				markersOnMap[i].iconColor = "black"
					markersOnMap[i].marker.setMap(null);markersOnMap[i].marker = null;
					/*Find the correct icon in order to create the new marker*/
					switch(markersOnMap[i].jobType){
						case "JOB_CLEAN": proIcon = "img/clean-icon.png";break;
						case "JOB_ELECTRIC": proIcon = "img/electric-icon.png";break;
						case "JOB_GAS": proIcon = "img/gas-icon.png"; break;
						case "JOB_SPECIAL": proIcon = "img/fix-icon.png"; break;
						default: proIcon = "img/car-icon-black.png"; break;				
				}
				/*Pop up small notification on the bottom left corner if pro becomes back on time and if ETA is calculated correctly*/
				if(markersOnMap[i].ETA != 0)
					$.notify(markersOnMap[i].name + " (JobID: " + markersOnMap[i].jobID + ") is back on time!",  {position: "bottom left", className: "success", autoHide: false});
				markersOnMap[i].marker = createMarker(map, markersOnMap[i].proLoc, "Profesional", null, proIcon, PRO_MARKER_SIZE, "Pro: " + markersOnMap[i].name + "<br>Job ID: " + markersOnMap[i].jobID + "<br> Start Time: " + "<br>ETA: ", false)
			
			}
		}
	}
	done = true;
}
/**Shows user control buttons and directions panel**/
function enableControls(map){
	/* Create the DIV to hold the control and call the ButtonControl() constructor passing in this DIV*/
	var controlDiv = document.createElement('div');
	var control = new ButtonControl(map, controlDiv);
	map.controls[google.maps.ControlPosition.TOP_RIGHT].push(controlDiv); 
	/*Class that defines the menu button*/
	function ButtonControl(map, controlDiv){  
	    /* Set CSS for the Button border. */
	    var panelButton = document.createElement('div');
	    panelButton.id = 'panelButton';
	    panelButton.title = 'Click to show panel';
	    controlDiv.appendChild(panelButton);
	    
	    var panelImg = document.createElement('img')
	    panelImg.src = 'img/menu-icon.png';
	    panelButton.appendChild(panelImg);

	    /*NOTE: to use the animate function, simply change "getDirections" to "animateMap"
	    /*Set appropriate actions for each button click*/
	    panelButton.addEventListener('click', function(){
	    	if(hidePanel)showPanel(map);
	    	else _hidePanel(map)
	    })
	}
}
/**Creates a marker given the map, position on the map, hover-over icon title, animation
 * icon URL, scaled size of icon, and (clicked upon) infoBox info*/
function createMarker(map, pos, title, animation, icon, size, info, isClient){
	var zIndex;
	isClient ? zIndex = 1 : zIndex = -1; /*Put pro markers in front of client markers -- TODO: not working, but no big deal*/
	function attachInfo(marker, info){
		/*Added functionality to display infoWindow on clicking of markers*/
		var infoWindow = new google.maps.InfoWindow({
			content: info
		});
		marker.addListener('click', function(){
			infoWindow.open(marker.get('map'), marker)
			map.panTo(marker.getPosition());
		});
		/*Stop the bouncing animation*/
		if(animation === google.maps.Animation.BOUNCE)setTimeout(function(){ marker.setAnimation(null); }, 3000);
		/*If the user checked "Show Data"*/
		if(showDataChecked)infoWindow.open(map, marker);/*Open infoWindow*/
	}
	/*Push all passed information into marker*/
	var marker = new google.maps.Marker({
		position: pos,
		map: map,
		title: title, /*For hover-over*/
		animation: animation,
		zIndex: zIndex,
		//optimized : false,
		icon: {
			url: icon,
			size: new google.maps.Size(size, size),
			scaledSize: new google.maps.Size(size, size),
		}
	});
	/*Only attach initial infoWindow if we're working with a client, otherwise the pro infoWindows update automatically, and don't need an initial window (hard to keep track of)*/
	if(isClient)
		attachInfo(marker, info);
	return marker;
}

var errorText; /*Text element for alerting user -- need this global in case of spamming flashErrors*/
/**Shakes parent, displays message under parent at the specified Margin*/
function errorMsg(msg, margin, parent){
	if(errorText)
		errorText.remove();
	/*Display error message*/
	errorText = document.createElement('div');
	errorText.innerHTML = msg;
	errorText.style.color = "red";
	errorText.style.marginTop = margin;
	document.getElementById(parent).appendChild(errorText);
	/*Shake on error*/
	var l = 10;  
	   for( var i = 0; i < 10; i++ )   
	     $("#" + parent).animate( { 
	         'margin-left': "+=" + ( l = -l ) + 'px',
	         'margin-right': "-=" + l + 'px'
	      }, 50);
}
var hidePanel;
/**Hides the panel and repositions the map**/
function _hidePanel(map){
	hidePanel = true;
	$("#panel").hide('fast'); /*Hide the Directions Panel*/
	/*Resize map when panel hides*/
	setTimeout(function(){
		google.maps.event.trigger(map, "resize");
		if(bounds)map.fitBounds(bounds);
	}, 200);
	document.getElementById("panel").style.overflow = 'auto';/*Need this line because of a small bug in JQuery.hide()/show()*/
	//document.getElementById("map").style.marginRight= "0px";
}
/**Shows the panel and repositions the map**/
function showPanel(map){
	hidePanel = false;
	$("#panel").show('fast'); /*Show the Directions Panel*/
	/*Resize map when panel appears*/
	setTimeout(function(){
		google.maps.event.trigger(map, "resize");
		if(bounds)map.fitBounds(bounds);
	}, 200);/*TODO: ADD CENTERING MECHANISM BASED ON SHOWN MARKERS (i.e setCenter()) -- ADD IT IN THIS TIMEOUT*/
	document.getElementById("panel").style.overflow = 'auto'; /*Need this line because of a small bug in JQuery.hide()/show()*/
	//document.getElementById("map").style.marginRight= "400px";
}
/**Appends Tuten Icon to the map**/
function appendIcon(map){
	var icon = document.createElement('icon');
	icon.innerHTML = '<img src="img/tuten-icon-big.png">';
	icon.id = 'icon';
	map.controls[google.maps.ControlPosition.TOP_LEFT].push(icon);
}
/**Reads the TOKEN from the URL (NOTE: this may need to be rearranged if the address format changes from the expected:
 * XXXXX?t=TOKEN with nothing more connecting*/
function getToken(){
	var query = window.location.search.substring(1); /*Everything after '?' i.e. "t=TOKEN&a=bool..."*/
	var query_array = query.split(/&|=/);/*Array like {t, TOKEN, a, true...}*/
	var token = false;
	for(i = 0; i < query_array.length; i++){
		if(query_array[i] == 't')
			token = query_array[i+1]; /*token gets the next element in the array*/
	}	
	//alert(token);
	return token;
}
/**Gets the environment from the URL**/ 
function getEnv(){
	var env = ''
	var hostName = window.location.hostname; /*full URL"*/
	if(hostName == "localhost" || hostName == 'dev.tuten.cl')
		return 'dev.'; /*If we are using a localhost, return dev server*/
	if(hostName == 'cert.tuten.cl')
		return 'cert.';
	return env;/*Return production*/
}
/**Provides the color scheme for the map -- Pick one of the options below**/
function styleMap(map){
	//map.set('styles', [{"featureType":"all","elementType":"labels.text.fill","stylers":[{"color":"#ffffff"}]},{"featureType":"all","elementType":"labels.text.stroke","stylers":[{"color":"#000000"},{"lightness":13}]},{"featureType":"administrative","elementType":"geometry.fill","stylers":[{"color":"#000000"}]},{"featureType":"administrative","elementType":"geometry.stroke","stylers":[{"color":"#144b53"},{"lightness":14},{"weight":1.4}]},{"featureType":"landscape","elementType":"all","stylers":[{"color":"#08304b"}]},{"featureType":"poi","elementType":"geometry","stylers":[{"color":"#0c4152"},{"lightness":5}]},{"featureType":"road.highway","elementType":"geometry.fill","stylers":[{"color":"#000000"}]},{"featureType":"road.highway","elementType":"geometry.stroke","stylers":[{"color":"#0b434f"},{"lightness":25}]},{"featureType":"road.arterial","elementType":"geometry.fill","stylers":[{"color":"#000000"}]},{"featureType":"road.arterial","elementType":"geometry.stroke","stylers":[{"color":"#0b3d51"},{"lightness":16}]},{"featureType":"road.local","elementType":"geometry","stylers":[{"color":"#000000"}]},{"featureType":"transit","elementType":"all","stylers":[{"color":"#146474"}]},{"featureType":"water","elementType":"all","stylers":[{"color":"#021019"}]}]
	//map.set('styles', [{"featureType":"poi","elementType":"all","stylers":[{"hue":"#000000"},{"saturation":-100},{"lightness":-100},{"visibility":"off"}]},{"featureType":"poi","elementType":"all","stylers":[{"hue":"#000000"},{"saturation":-100},{"lightness":-100},{"visibility":"off"}]},{"featureType":"administrative","elementType":"all","stylers":[{"hue":"#000000"},{"saturation":0},{"lightness":-100},{"visibility":"off"}]},{"featureType":"road","elementType":"labels","stylers":[{"hue":"#ffffff"},{"saturation":-100},{"lightness":100},{"visibility":"off"}]},{"featureType":"water","elementType":"labels","stylers":[{"hue":"#000000"},{"saturation":-100},{"lightness":-100},{"visibility":"off"}]},{"featureType":"road.local","elementType":"all","stylers":[{"hue":"#ffffff"},{"saturation":-100},{"lightness":100},{"visibility":"on"}]},{"featureType":"water","elementType":"geometry","stylers":[{"hue":"#ffffff"},{"saturation":-100},{"lightness":100},{"visibility":"on"}]},{"featureType":"transit","elementType":"labels","stylers":[{"hue":"#000000"},{"saturation":0},{"lightness":-100},{"visibility":"off"}]},{"featureType":"landscape","elementType":"labels","stylers":[{"hue":"#000000"},{"saturation":-100},{"lightness":-100},{"visibility":"off"}]},{"featureType":"road","elementType":"geometry","stylers":[{"hue":"#bbbbbb"},{"saturation":-100},{"lightness":26},{"visibility":"on"}]},{"featureType":"landscape","elementType":"geometry","stylers":[{"hue":"#dddddd"},{"saturation":-100},{"lightness":-3},{"visibility":"on"}]}]
	map.set('styles', [{"featureType":"administrative","elementType":"labels.text.fill","stylers":[{"color":"#6195a0"}]},{"featureType":"landscape","elementType":"all","stylers":[{"color":"#f2f2f2"}]},{"featureType":"landscape","elementType":"geometry.fill","stylers":[{"color":"#ffffff"}]},{"featureType":"poi","elementType":"all","stylers":[{"visibility":"off"}]},{"featureType":"poi.park","elementType":"geometry.fill","stylers":[{"color":"#e6f3d6"},{"visibility":"on"}]},{"featureType":"road","elementType":"all","stylers":[{"saturation":-100},{"lightness":45},{"visibility":"simplified"}]},{"featureType":"road.highway","elementType":"all","stylers":[{"visibility":"simplified"}]},{"featureType":"road.highway","elementType":"geometry.fill","stylers":[{"color":"#f4d2c5"},{"visibility":"simplified"}]},{"featureType":"road.highway","elementType":"labels.text","stylers":[{"color":"#4e4e4e"}]},{"featureType":"road.arterial","elementType":"geometry.fill","stylers":[{"color":"#f4f4f4"}]},{"featureType":"road.arterial","elementType":"labels.text.fill","stylers":[{"color":"#787878"}]},{"featureType":"road.arterial","elementType":"labels.icon","stylers":[{"visibility":"off"}]},{"featureType":"transit","elementType":"all","stylers":[{"visibility":"off"}]},{"featureType":"water","elementType":"all","stylers":[{"color":"#eaf6f8"},{"visibility":"on"}]},{"featureType":"water","elementType":"geometry.fill","stylers":[{"color":"#eaf6f8"}]}]
)}