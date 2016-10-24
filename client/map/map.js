/**For admin mode set "a" to "true" : http://localhost:8085/GoogleMapsAPI/index.html?a=true&t=TOKEN*/

var clientLoc;
var clientName;
var proLoc;
var proName;
var proIcon = "img/car-icon.png";
var proMarker; 
var hidePanel = true;
bounds = null;
var usingMap = false;
var onMobileDevice;
var tM = google.maps.DirectionsTravelMode.DRIVING; /* Current Travel Mode*/
var validJob = false;
var timeAwayFromDevice = 0;

var PRO_MARKER_SIZE = 25;
var CLIENT_MARKER_SIZE = 30;

function initMap() {
	/*Make our map at the default Santiago coordinates*/
	var map = document.getElementById('map');
	
	var	map = new google.maps.Map(map, {
		center : {lat: -33.4489, lng: -70.6693},
		zoom : 13,
		mapTypeId: google.maps.MapTypeId.ROADMAP,
		disableDefaultUI: true
	});	
	/*If we're on a mobile device, display stuff a little differently*/
	if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|BB|PlayBook|IEMobile|Windows Phone|Kindle|Silk|Opera Mini/i.test(navigator.userAgent)){
		onMobileDevice = true;}
	else{
		onMobileDevice = false;}
	/*Hide Panel and trigger resize centering*/
	$("#panel").hide();
	if(!onMobileDevice){
		google.maps.event.addDomListener(window, "resize", function() {
			if(bounds)map.fitBounds(bounds); 
		    });
	}
	/*Show the loading panel only when the job becomes valid*/
	$("#loading").hide()
	var loadListener = setInterval(function(){
		if(validJob && proLoc){
			$("#loading").show();
			clearInterval(loadListener);
		}}, 2000)
	
	findClientLoc(map);
	findAndRefreshProLoc(map); /*Update Pro's location at the rate specified by the back-end*/
	
	if(isAdmin())
		setTimeout(function(){enableAdminControls(map);},2500);/*On-click directions (wait for positions to be found)*/
	else{/*No need for the panel, remove it and stretch out the map*/
		//document.getElementById("map").style.width= "100%";
		document.getElementById("panel").remove();
		//document.getElementById("map").style.marginRight= "400px";
	}
	setTimeout(function(){appendIcons(map);}, 1000);/*For appearance*/
	
	env = getEnv();
	if(env != '')/*Warn to make sure the user entered his environment parameters correctly*/
		console.warn("WARNING: Fetching from environment of type: " + env.toUpperCase() + "...Make sure this is a valid environment for FETCH");
	else
		console.warn("Using production server");/*TODO: May want to delete this line once production is released*/
	
	if(getToken() == null)
		console.warn("WARNING: Could not find TOKEN");
	
	if(!onMobileDevice){/*We need to know if the user is using the map in order to know if we can center it or not*/
		google.maps.event.addListener(map, 'mouseover', function(){
			usingMap = true;
		});
		google.maps.event.addListener(map, 'mouseout', function(){
			usingMap = false;
		});
		setInterval(function(){/*every 15 seconds, re-center the screen to show the pro and the user, given the user isn't using the map*/
			if(!usingMap && proLoc && clientLoc){
				bounds = new google.maps.LatLngBounds();
				bounds.extend(proLoc);
				bounds.extend(clientLoc);
				map.fitBounds(bounds);
			}
			else if(!usingMap && !proLoc && clientLoc){
				map.panTo(clientLoc);
			}
		}, 5000)
	}
	else if(onMobileDevice){/*If we're on a mobile device, we need to handle auto-centering a little differently -- center every 10 seconds not touching device*/
		setInterval(function(){
			timeAwayFromDevice += 1;
		}, 1000)
		google.maps.event.addListener(map, 'mouseup', function(){/*same as 'touchend'*/
			timeAwayFromDevice = 0;
		});
		setInterval(function(){
			if(timeAwayFromDevice > 4){/*More than 4 seconds*/
				if(clientLoc && !proLoc)/*If it's just the client on the screen (non-valid job) simply pan to the client after timer expire*/
					map.panTo(clientLoc);
				else if(clientLoc && proLoc){/*If we have the pro and client location, center map to include both of them*/
					bounds = new google.maps.LatLngBounds();
					bounds.extend(proLoc);
					bounds.extend(clientLoc);
				}
				timeAwayFromDevice = 0;
			}
		}, 1000)
	}
	setInterval(function(){updateETA()},15000)
	/*Remove default style to elaborate the location of the client and user*/
	styleMap(map);
}

/**Finds the professional's position, saves it into proLoc, and creates the marker -> refreshes every REFRESHRATE * 1000 milliseconds**/
function findAndRefreshProLoc(map){
	var refreshRate;
	/*Don't set the interval and run the function until we find the refresh rate*/
	$.when($.getJSON('http://' + getEnv() + 'tuten.cl:8080/TutenREST/rest/booking/map/' + getToken(), function(jd){
		refreshRate = jd.secondsInterval;
	})).then(function(){
		setInterval(function(){
			$.when($.getJSON('http://' + getEnv() + 'tuten.cl:8080/TutenREST/rest/booking/map/' + getToken(), function(jd){
				validJob = jd.validJob; 
				if(jd.validJob){
					if(!jd.professionalS || !jd.professionalW)
						return;/*Can't find pro's position, don't display it*/
					proLoc = new google.maps.LatLng(jd.professionalS, jd.professionalW);} /*NOTE:: NEEDED TO ADJUST SIGN OF COORDINATES*/
				else
					console.warn('ERROR: MAP REQUEST NOT A VALID JOB'); /*TODO: Location error handling*/
			})).then(function(){
				/*Wait for proLoc to be valid before showing location -- Don't need setTimout here because of the higher setInterval (unlike findClientLoc)*/
					if(!proLoc)
						return; /*Can't find pro's position, don't display it*/
					else if(!proMarker){ /*If this is the first time calling the function or if the icon has changed, create the marker*/
						proMarker = createMarker(map, proLoc, null, google.maps.Animation.DROP, proIcon, PRO_MARKER_SIZE, "Tu Maestro: " + "("+ proName + ")");
						if(!bounds)bounds = new google.maps.LatLngBounds();
						bounds.extend(proLoc)
						map.fitBounds(bounds);
						updateETA();
					}
					else{ /*Else update the position*/
						proMarker.setPosition(proLoc);
					}
			});
		},refreshRate * 1000);
	});
	/**Finds the refresh rate**/
	function getRefreshRate(){
		var rr;
		$.when($.getJSON('http://' + getEnv() + 'tuten.cl:8080/TutenREST/rest/booking/map/' + getToken(), function(jd){
			rr = jd.secondsInterval;
		})).then(function(){
		/*Wait to read rate before returning it*/
			return rr;
		});	
	}
}
/**Finds the client's location, saves it into clientLoc, and creates the marker -- Designed for one-time call (unlike findAndRefreshProLoc())**/
function findClientLoc(map){
	$.when($.getJSON('http://' + getEnv() + 'tuten.cl:8080/TutenREST/rest/booking/map/' + getToken(), function(jd){
		if(jd.validJob){
			clientLoc = new google.maps.LatLng(jd.clientS, jd.clientW);
			/*While we're at it, lets store some names*/
			clientName = jd.clientName;
			proName = jd.proName;
		}
		else
			console.warn('ERROR: MAP REQUEST NOT A VALID JOB'); /*TODO: Location error handling*/
	})).then(function(){
	/*Wait to read location from JSON before attempting to use it*/
		map.panTo(clientLoc);
		if(!bounds)bounds = new google.maps.LatLngBounds();
		bounds.extend(clientLoc);
		//map.setZoom(13);
		createMarker(map, clientLoc, null, google.maps.Animation.DROP, 'img/tuten-icon.png', CLIENT_MARKER_SIZE, "Tu: " + "("+ clientName  + ")");
	});	
}
/**Shows user control buttons and directions panel**/
function enableAdminControls(map){
	/* Create the DIV to hold the control and call the ButtonControl() constructor passing in this DIV*/
	var controlDiv = document.createElement('div');
	var control = new ButtonControl(map, controlDiv);

	controlDiv.index = 1;
	controlDiv.style['padding-top'] = '10px';
	map.controls[google.maps.ControlPosition.TOP_CENTER].push(controlDiv);
    
}
function ButtonControl(map, controlDiv){
	/* Set CSS for the Button border.*/
    var driveButton = document.createElement('div');
    driveButton.id = 'driveButton';
    driveButton.title = 'Click for driving instructions';
    driveButton.style.backgroundImage = "url('img/car-icon.png')";
    controlDiv.appendChild(driveButton);
    
    /* Set CSS for the Button border. */
    var walkButton = document.createElement('div');
    walkButton.id = 'walkButton';
    walkButton.style.backgroundImage = "url('img/walk-icon.png')";
    walkButton.title = 'Click for walking instructions';
    controlDiv.appendChild(walkButton);
    
    /* Set CSS for the Button border. */
    var transitButton = document.createElement('div');
    transitButton.id = 'transitButton';
    transitButton.style.backgroundImage = "url('img/transit-icon.png')";
    transitButton.title = 'Click for transit instructions';
    controlDiv.appendChild(transitButton);
    
    /* Set CSS for the Button border. */
    var bikeButton = document.createElement('div');
    bikeButton.id = 'bikeButton';
    bikeButton.style.backgroundImage = "url('img/bicycle-icon.png')";
    bikeButton.title = 'Click for bicycling instructions';
    controlDiv.appendChild(bikeButton);
    
    /* Set CSS for the Button border. */
    var clearButton = document.createElement('div');
    clearButton.id = 'clearButton';
    clearButton.style.backgroundImage = "url('img/clear-icon.png')";
    clearButton.title = 'Click to clear instructions';
    controlDiv.appendChild(clearButton);
    

    /*NOTE: to use the animate function, simply change "getDirections" to "animateMap"
    /*Set appropriate actions for each button click*/
    driveButton.addEventListener('click', function(){
    	getDirections(map, google.maps.DirectionsTravelMode.DRIVING);
    });

    walkButton.addEventListener('click', function(){
    	getDirections(map, google.maps.DirectionsTravelMode.WALKING);
    });
    
    transitButton.addEventListener('click', function(){
    	getDirections(map, google.maps.DirectionsTravelMode.TRANSIT);
    });

    bikeButton.addEventListener('click', function(){
    	getDirections(map, google.maps.DirectionsTravelMode.BICYCLING);
    });
    clearButton.addEventListener('click', function(){
    	if(hidePanel)flashError(map, 'no directions to clear');
    	if(proLoc)_hidePanel(map);
    	else map.panTo(clientLoc);
    	if(directionsDisplay)directionsDisplay.setMap(null);
    })
}
/**Creates a marker given the map, position on the map, hover-over icon title, animation
 * icon URL, scaled size of icon, and (clicked upon) infoBox info*/
function createMarker(map, pos, title, animation, icon, size, info){
	function attachInfo(marker, info){
		/*Added functionality to display infoWindow on clicking of markers*/
		var infoWindow = new google.maps.InfoWindow({
			content: info
		});
		marker.addListener('click', function(){
			//map.setZoom(18);
			infoWindow.open(marker.get('map'), marker)
			map.panTo(marker.getPosition());
		});
		/*Stop the bouncing animation*/
		if(animation === google.maps.Animation.BOUNCE)setTimeout(function(){ marker.setAnimation(null); }, 3000);
	}
	/*Push all passed information into marker*/
	var marker = new google.maps.Marker({
		position: pos,
		map: map,
		title: title, /*For hover-over*/
		animation: animation,
		zIndex: Math.round(pos.lat()*-100000)<<5,
		//optimized : false,
		icon: {
			url: icon,
			size: new google.maps.Size(size, size),
			scaledSize: new google.maps.Size(size, size),
		}
	});
	attachInfo(marker, info);
	return marker;
}

var directionsDisplay;
var directionsService;
/**Finds and displays directions based on the global clientLoc and proLoc**/
function getDirections(map, travelMode){
	/*TODO: Add travel mode to backend so we can better estimate when the pro will arrive (right now , it's defaulted to driving)*/
	tM = travelMode;
	/*Switch the icon based on means of travel*/
	switch(travelMode){
	case google.maps.DirectionsTravelMode.WALKING:
		proIcon = "img/walk-icon.png";
		break;
	case google.maps.DirectionsTravelMode.TRANSIT:
		proIcon = "img/transit-icon.png";
		break;
	case google.maps.DirectionsTravelMode.BICYCLING:
		proIcon = "img/bicycling-icon.png";
		break;
	default:
		proIcon = "img/car-icon.png";
	}
	/*In case we can't find your location*/
	if(!clientLoc){
		clientLoc = 'Santiago, Chile';
		console.warn('ERROR: COULD NOT FIND CLIENT LOC');
		flashError(map, 'searching for client\'s location...');
		return;}
	if(!proLoc){
		//proLoc = 'Santiago, Chile';
		console.warn('ERROR: COULD NOT FIND PRO LOC');
		flashError(map, 'searching for pro\'s location...');
		return;}
	/*If there's already directions showing, clear them*/
	if(directionsDisplay){directionsDisplay.setMap(null);directionsDisplay.setPanel(null);}
		
	directionsService = new google.maps.DirectionsService();
	
	/*Define directions request*/
	var request = {
		origin: proLoc,
		destination: clientLoc,
		travelMode: travelMode /*Specified by ADMIN*/
	};
	/*Create a renderer for directions and bind it to the map*/
	var rendererOptions = {
		map: map,
		suppressMarkers: true,
		preserveViewport: true,
		polylineOptions: {
		      strokeColor: "#56c5c7",
		      strokeWeight: 5
		    }
	}
	directionsDisplay = new google.maps.DirectionsRenderer(rendererOptions);
	directionsDisplay.setPanel(document.getElementById("panel"));
	/*Issue a directions search request, do some error handling*/
	directionsService.route(request, function(response, status){
		if(status == google.maps.DirectionsStatus.OK){
			directionsDisplay.setDirections(response);
			/*Create a new marker in case that the icon changes*/
			if(proMarker)proMarker.setMap(null);
			proMarker = createMarker(map, proLoc, null, null, proIcon, PRO_MARKER_SIZE, "Tu Maestro: " + "("+ proName + ")");
			showPanel(map);
			bounds = new google.maps.LatLngBounds()
			bounds.extend(clientLoc);
			bounds.extend(proLoc);
		}
		else{	
			_hidePanel(map);
			flashError(map, 'could not find directions');
		}		
	});		
}
var ETA = null;
function updateETA(){
	if(proLoc && clientLoc){
		var duration = 0;
		dS = new google.maps.DirectionsService();
		/*Define directions request*/
		var request = {
			origin: proLoc,
			destination: clientLoc,
			travelMode: tM /*Specified by ADMIN -- default to driving*/
		};
		dS.route(request, function(response, status){
			if(status == google.maps.DirectionsStatus.OK){
				legs = response.routes[0].legs;
				/*Just in case we have way points, parse through all legs*/
				for(i = 0; i < legs.length; i++)
					duration += legs[i].duration.value;
				ETA = convertSeconds(duration);
			}
		});	
	}
	function convertSeconds(seconds){
		var days = Math.floor((seconds % 31536000) / 86400);
		var hours = Math.floor(((seconds % 31536000) % 86400) / 3600);
		var minutes = Math.floor((((seconds % 31536000) % 86400) % 3600) / 60);
		if(days > 0)
			return days + "\nDIA " + hours + "\nHRS " + minutes + "\nMIN"
		if(hours == 1)
			return hours + "\nHRA " + minutes + "\nMIN"
		if(hours > 0)
			return hours + "\nHRS " + minutes + "\nMIN"
		if(minutes > 0)
			return minutes + "\nMIN"
	}
}
var errorText; /*Text element for alerting user -- need this global in case of spamming flashErrors*/
/**Pop up a quick text to alert the user that Google maps can't find directions for this method**/
function flashError(map, msg){
	if(errorText)errorText.remove();/*Remove last error text*/
	errorText = document.createElement('div');
	errorText.id = 'errorText';
	errorText.innerHTML = msg;
	map.controls[google.maps.ControlPosition.CENTER].push(errorText);
	$(function() {
		  $("#errorText").animate({opacity: 0.8}, 1000, 'linear')
		     .animate({opacity: 0.0}, 1000, 'linear');  
		});
}
var hidePanel;
/**Hides the panel and repositions the map**/
function _hidePanel(map){
	hidePanel = true;
	$("#panel").hide('fast'); /*Hide the Directions Panel*/
	/*Resize map when panel hides*/
	setTimeout(function(){google.maps.event.trigger(map, "resize");if(bounds)map.fitBounds(bounds);}, 200);
	document.getElementById("panel").style.overflow = 'auto';/*Need this line because of a small bug in JQuery.hide()/show()*/
	//document.getElementById("map").style.marginRight= "0px";
}
/**Shows the panel and repositions the map**/
function showPanel(map){
	hidePanel = false;
	$("#panel").show('fast'); /*Show the Directions Panel*/
	/*Resize map when panel appears*/
	setTimeout(function(){google.maps.event.trigger(map, "resize");if(bounds)map.fitBounds(bounds);}, 200);
	document.getElementById("panel").style.overflow = 'auto'; /*Need this line because of a small bug in JQuery.hide()/show()*/
	//document.getElementById("map").style.marginRight= "400px";
}

/**Appends Tuten Icon to the map**/
function appendIcons(map){
	/*Tuten Icon*/
	var div = document.createElement('div');
	var icon = document.createElement('img');
	icon.id = 'icon';
	icon.src = "img/tuten-icon-big.png";
	div.appendChild(icon);
	if(onMobileDevice)/*This makes the icon look much better on a mobile device*/
		icon.style.width = '60%';
	map.controls[google.maps.ControlPosition.TOP_LEFT].push(div);
	
	/*Load panel*/
	//if(!isAdmin() && onMobileDevice){
		var txt = document.createElement('div');
		var loading = document.getElementById('loading');
		
		txt.id = "eta";
		loading.appendChild(txt);
	
		map.controls[google.maps.ControlPosition.TOP_RIGHT].push(loading);
		
		/*Append ETA icon on the screen upon receiving the ETA (keep on checking and clear interval when done)*/
		setInterval(function(){
			if(ETA){
				txt.innerHTML = ETA;
			}
		}, 1000);
	//}
}
/**Reads the TOKEN from the URL (NOTE: this may need to be rearranged if the address format changes from the expected:
 * XXXXX?t=TOKEN with nothing more connecting*/
function getToken(){
	var query = window.location.search.substring(1); /*Everything after '?' i.e. "t=TOKEN&a=bool..."*/
	var query_array = query.split(/&|=/);/*Array like {t, TOKEN, a, true...}*/
	var token = null;
	for(i = 0; i < query_array.length; i++){
		if(query_array[i] == 't')
			token = query_array[i+1]; /*token gets the next element in the array*/
	}	
	return token;
}
/**Reads the URL and decides if admin is using the application -- Code very similar to getToken()*/
function isAdmin(){
	var query = window.location.search.substring(1); /*Everything after '?' i.e. "t=TOKEN&a=bool..."*/
	var query_array = query.split(/&|=/);/*Array like {t, TOKEN, a, true...}*/
	var isAdmin = null;
	for(i = 0; i < query_array.length; i++){
		if(query_array[i] == 'a')
			isAdmin = query_array[i+1] == "true"; /*Convert string to boolean*/
	}
	if(isAdmin == null){
		console.warn("WARNING: Could not find Administrator rights");
		isAdmin = false;
	}	
	return isAdmin;
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
/**The Following functions aren't necessary for this project, but may be for future projects*/
///*Declare our variables-> Must be global to support multiple jobs*/
//var stepDisplay;
//var position;
//var marker = null;
//var polyline = null;
//var timerHandle = null;
//var steps = [];
///**Animates this app working correctly**/
//function animateMap(map, travelMode){
//	/*Switch the icon based on means of travel*/
//	switch(travelMode){
//	case google.maps.DirectionsTravelMode.WALKING:
//		proIcon = "img/walk-icon.png";
//		break;
//	case google.maps.DirectionsTravelMode.TRANSIT:
//		proIcon = "img/transit-icon.png";
//		break;
//	case google.maps.DirectionsTravelMode.BICYCLING:
//		proIcon = "img/bicycling-icon.png";
//		break;
//	default:
//		proIcon = "img/car-icon.png";
//	}
//	/*In case we can't find your location*/
//	if(!clientLoc)
//		clientLoc = 'Santiago, Chile';
//	
//	/*Here, we'll animate the line between Valparaiso and Santiago*/
//	calcRoute(map, "Providencia, Santiago, Chile", "Buenos Aires, Argentina");
//	
//	function calcRoute(map, start, end){
//		/*Clear previous timer*/
//		if(timerHandle)clearTimeout(timerHandle);
//		/*Remove marker from map if already set*/
//		if(marker)marker.setMap(null);
//		/*More clears*/
//		if(polyline)polyline.setMap(null);
//		if(directionsDisplay){directionsDisplay.setMap(null);directionsDisplay.setPanel(null);}
//		
//	 	/*Info window to hold the step text*/	
//		stepDisplay = new google.maps.InfoWindow();
//		
//		directionsService = new google.maps.DirectionsService();
//		/*Define the path lines from point A to point B*/
//		polyline = new google.maps.Polyline({
//		path: [],
//		/*Tuten Colors*/
//		strokeColor: '#56c5c7',
//		strokeWeight: 3
//		});
//		/*Create a renderer for directions and bind it to the map*/
//		var rendererOptions = {
//			map: map,
//			suppressMarkers: true,
//			polylineOptions: {
//			      strokeColor: "#56c5c7",
//			      strokeWeight: 5
//			    }
//		}
//		directionsDisplay = new google.maps.DirectionsRenderer(rendererOptions);
//		
//		/*Define directions request*/
//		var request = {
//			origin: start,
//			destination: end,
//			travelMode: travelMode /*Specified by ADMIN*/
//		};
//			
//		/*Issue a directions search request*/
//		/*Pass the response to update markers for each step*/
//		directionsService.route(request, function(response, status){
//			if(status == google.maps.DirectionsStatus.OK){
//				directionsDisplay.setDirections(response);
//				/*Useful definitions*/
//				var bounds = new google.maps.LatLngBounds();
//				var route = response.routes[0];
//				var path = route.overview_path;
//				var legs = route.legs;
//				startLocation = new Object();
//				endLocation = new Object();
//			
//				/*For each route display summary info*/
//				for(i = 0; i < legs.length; i++){
//					
//					/*If there are no legs (we're at the beginning), create the start marker*/
//					if(i == 0){
//						startLocation.pos = legs[i].end_location;
//						startLocation.address = legs[i].end_address;
//						marker = createMarker(map, legs[i].start_location, "Tu Maestro: " + "("+ proName + ")", null, proIcon, 25, legs[i].start_address);				
//					}
//					endLocation.pos = legs[i].end_location;
//					endLocation.address = legs[i].end_address;
//					var steps = legs[i].steps; 
//					for(j = 0; j < steps.length; j++){
//						var nextSegment = steps[j].path;
//						for(k = 0; k < nextSegment.length; k++){
//							polyline.getPath().push(nextSegment[k]);
//							bounds.extend(nextSegment[k]);
//							}
//						}
//					}
//				
//				//polyline.setMap(map);
//				directionsDisplay.setMap(map);
//				
//				map.fitBounds(bounds);
//				map.setZoom(13);
//				startAnimation(map);		
//			}			
//		});
//		var step = 5; 	//meters
//		var tick = 100;	//milliseconds
//		var eol;
//		
//		/********************Animated Functions*******************/
//		function animate(map, d){
//			/*If we're at the end of our segment, stop animating*/
//			if(d > eol){
//				map.panTo(endLocation.pos);
//				marker.setPosition(endLocation.pos);
//				return;
//			}
//			/*Else, animate recursively every tick*/
//			var p = polyline.GetPointAtDistance(d);
//			//map.panTo(p); /*Follow the professional --- May need to do this only on Idle*/
//			marker.setPosition(p);
//			/*Hide route on client command*/
//		
//			timerHandle = setTimeout(function(){animate(map, d+step);}, tick);
//		}
//		function startAnimation(map){
//			/*Total distance*/
//			eol = polyline.Distance();
//			if(!isAdmin()){
//				/*...Then hide the Route*/
//				directionsDisplay.setMap(null);
//				map.setCenter(polyline.getPath().getAt(0));
//				map.setZoom(13);
//			}
//			else{
//				document.getElementById("map").style.marginRight= "400px";
//				directionsDisplay.setPanel(document.getElementById('panel'));
//			}
//			/*Wait for map to display*/
//			setTimeout(function(){animate(map, 50);}, 2000);
//		}
//	}	
//}
///**Sets the style of the map*/
function styleMap(map){
	//map.set('styles', [{"featureType":"all","elementType":"labels.text.fill","stylers":[{"color":"#ffffff"}]},{"featureType":"all","elementType":"labels.text.stroke","stylers":[{"color":"#000000"},{"lightness":13}]},{"featureType":"administrative","elementType":"geometry.fill","stylers":[{"color":"#000000"}]},{"featureType":"administrative","elementType":"geometry.stroke","stylers":[{"color":"#144b53"},{"lightness":14},{"weight":1.4}]},{"featureType":"landscape","elementType":"all","stylers":[{"color":"#08304b"}]},{"featureType":"poi","elementType":"geometry","stylers":[{"color":"#0c4152"},{"lightness":5}]},{"featureType":"road.highway","elementType":"geometry.fill","stylers":[{"color":"#000000"}]},{"featureType":"road.highway","elementType":"geometry.stroke","stylers":[{"color":"#0b434f"},{"lightness":25}]},{"featureType":"road.arterial","elementType":"geometry.fill","stylers":[{"color":"#000000"}]},{"featureType":"road.arterial","elementType":"geometry.stroke","stylers":[{"color":"#0b3d51"},{"lightness":16}]},{"featureType":"road.local","elementType":"geometry","stylers":[{"color":"#000000"}]},{"featureType":"transit","elementType":"all","stylers":[{"color":"#146474"}]},{"featureType":"water","elementType":"all","stylers":[{"color":"#021019"}]}]
	//map.set('styles', [{"featureType":"poi","elementType":"all","stylers":[{"hue":"#000000"},{"saturation":-100},{"lightness":-100},{"visibility":"off"}]},{"featureType":"poi","elementType":"all","stylers":[{"hue":"#000000"},{"saturation":-100},{"lightness":-100},{"visibility":"off"}]},{"featureType":"administrative","elementType":"all","stylers":[{"hue":"#000000"},{"saturation":0},{"lightness":-100},{"visibility":"off"}]},{"featureType":"road","elementType":"labels","stylers":[{"hue":"#ffffff"},{"saturation":-100},{"lightness":100},{"visibility":"off"}]},{"featureType":"water","elementType":"labels","stylers":[{"hue":"#000000"},{"saturation":-100},{"lightness":-100},{"visibility":"off"}]},{"featureType":"road.local","elementType":"all","stylers":[{"hue":"#ffffff"},{"saturation":-100},{"lightness":100},{"visibility":"on"}]},{"featureType":"water","elementType":"geometry","stylers":[{"hue":"#ffffff"},{"saturation":-100},{"lightness":100},{"visibility":"on"}]},{"featureType":"transit","elementType":"labels","stylers":[{"hue":"#000000"},{"saturation":0},{"lightness":-100},{"visibility":"off"}]},{"featureType":"landscape","elementType":"labels","stylers":[{"hue":"#000000"},{"saturation":-100},{"lightness":-100},{"visibility":"off"}]},{"featureType":"road","elementType":"geometry","stylers":[{"hue":"#bbbbbb"},{"saturation":-100},{"lightness":26},{"visibility":"on"}]},{"featureType":"landscape","elementType":"geometry","stylers":[{"hue":"#dddddd"},{"saturation":-100},{"lightness":-3},{"visibility":"on"}]}]
	map.set('styles', [{"featureType":"administrative","elementType":"labels.text.fill","stylers":[{"color":"#6195a0"}]},{"featureType":"landscape","elementType":"all","stylers":[{"color":"#f2f2f2"}]},{"featureType":"landscape","elementType":"geometry.fill","stylers":[{"color":"#ffffff"}]},{"featureType":"poi","elementType":"all","stylers":[{"visibility":"off"}]},{"featureType":"poi.park","elementType":"geometry.fill","stylers":[{"color":"#e6f3d6"},{"visibility":"on"}]},{"featureType":"road","elementType":"all","stylers":[{"saturation":-100},{"lightness":45},{"visibility":"simplified"}]},{"featureType":"road.highway","elementType":"all","stylers":[{"visibility":"simplified"}]},{"featureType":"road.highway","elementType":"geometry.fill","stylers":[{"color":"#f4d2c5"},{"visibility":"simplified"}]},{"featureType":"road.highway","elementType":"labels.text","stylers":[{"color":"#4e4e4e"}]},{"featureType":"road.arterial","elementType":"geometry.fill","stylers":[{"color":"#f4f4f4"}]},{"featureType":"road.arterial","elementType":"labels.text.fill","stylers":[{"color":"#787878"}]},{"featureType":"road.arterial","elementType":"labels.icon","stylers":[{"visibility":"off"}]},{"featureType":"transit","elementType":"all","stylers":[{"visibility":"off"}]},{"featureType":"water","elementType":"all","stylers":[{"color":"#eaf6f8"},{"visibility":"on"}]},{"featureType":"water","elementType":"geometry.fill","stylers":[{"color":"#eaf6f8"}]}]
)}
//
///**Displays legend along with the timer on the legend*/
//function displayLegend(map){
//	/*Decreases input number once every second -- perhaps use from directions service to output on the map for client*/
//	function countdown(num) {
//	    if (num >= 0) {
//	        document.getElementById("counter").innerHTML= toTimerFormat(num);
//	        setTimeout(function () { countdown(num - 1) }, 1000);
//	    }
//	    if (num == 0)
//	    	document.getElementById("counter").innerHTML= "Llegado!";
//	}
//	/* Converts seconds into a prettier format*/
//	function toTimerFormat(num){
//		digit1 = Math.floor((num/360)).toString();
//			if(digit1 < 10)digit1= "0" + digit1;
//		digit2 = Math.floor((num/60)).toString();
//			if(digit2 < 10)digit2= "0" + digit2;
//		digit3 = Math.floor((num%60)).toString();
//			if(digit3 < 10)digit3= "0" + digit3;
//		return digit1 + ":" + digit2 + ":" + digit3;
//	}
//	
//	num = 1000; /*Or however many seconds your professional will arrive, figure that out later*/
//	countdown(num);
//	var legend = document.getElementById('legend');
//	
//	/*For adding to the legend later
//	var div = document.createElement('div');
//	div.innerHTML = "Any string you or element you want"
//	legend.appendChild(div);
//	*/
//	
//	/*Place prompt message*/
//	map.controls[google.maps.ControlPosition.TOP_RIGHT].push(legend);
//	
//}
///** Import coordinate data from a GEOJSON end-point into the map as markers,
// * also adds more features to the markers
// * VERY SPECIFIC TO JSON FILE USED */
//function importData(map, isClient){
//	var markerArray = [];
//	var icon;
//	var endpoint;
//	var size;
//	var animation;
//	
//	/*Client-specific definitions (i.e. we want to place markers differently depending on if importing client or professional data)*/
//	if(isClient){
//		icon = 'img/tuten-icon.png';
//		endpoint = 'scripts/data.js'; //we'll mess with this later
//		size = 30;
//		animation = google.maps.Animation.BOUNCE;
//	}
//	else{
//		icon = 'img/car-icon.png';
//		endpoint = 'scripts/proData.js'; //as an example	
//		size = 20;
//		animation = google.maps.Animation.DROP;
//	}
//	/*Append data to HTML file*/
//	var script = document.createElement('script');
//	script.src = endpoint;
//	document.getElementsByTagName('head')[0].appendChild(script);
//	
//	/*Place a marker in the correct coordinates for each data point, as specifically defined by JSON file*/
//	window.eqfeed_callback = function(results){		
//		for(var i = 0; i < results.features.length; i++){
//			var coord = results.features[i].geometry.coordinates;
//			var pos = new google.maps.LatLng(coord[1], coord[0]);
//			/*Now we have the coordinates from the end-point in a GMaps structure*/
//			markerArray.push(createMarker(map, pos, results.features[i].properties.place, animation, icon, size, results.features[i].id));
//			//movePro(markerArray, 0); /*Need a better way to access this function -- synchronization problems*/
//		}
//	};
//	/*A useful array*/
//	return markerArray;
//}
//
///**Centers Map location to the host-device's location -- May need a better way to pass location, but the timing is hard*/
//function findLoc(map){
//	/*If geolocation is enabled*/
//	if (navigator.geolocation) {
//		/*getCurrentPosition() isn't working for some reason (doesn't respond to any case)*/
//	     navigator.geolocation.getCurrentPosition(
//	    	function (position) {
//	    		clientLoc = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);
//	    		map.setCenter(clientLoc);
//	    		createMarker(map, clientLoc, null, google.maps.Animation.BOUNCE, 'img/tuten-icon.png', 30, "Tu: " + "("+ clientName ")");
//	    		//infoWindow.setPosition(pos);
//	    		//infoWindow.setContent("Found your location!");
//	    	},
//	    	function(error) {
//	    		console.warn('ERROR(' + error.code + '): ' + error.message);
//	    		handleLocError(true, new google.maps.InfoWindow({map:map}), map.getCenter());	
//	    	},
//	    	{	timeout:5000,
//	    		enableHighAccuracy: true});}
//	else{
//		handleLocError(false, new google.maps.InfoWindow({map:map}), map.getCenter());
//	}
//	
//	function handleLocError(geoLocationEnabled, infoWindow, pos){
//		infoWindow.setPosition(pos);
//		infoWindow.setContent(geoLocationEnabled ? 
//				"Could not find your location" :
//        		"Geolocation disabled");
//	}
//}
