function addMotionSensor(sensor){
	console.log("Test adding: "+ JSON.stringify(sensor));

	//sensor apepars in WebGL	
    motionSensorVisible(true);

	//print attributes
	if (debug) {
		for (var att in sensor.att){
    		if (typeof sensor.att[att] !== 'function') {
         		console.log("Key: " + att + ", value: " + sensor.att[att]);
    		}
		}
	}
} 
	
	//TODO: animateMotionSensor akin to
	//spinningBoxFan = sensor['W_att']['on_off'];



//sending a message to change the RGB LED colour
function updateLED(state){
    console.log("Sending RGB LED update");

    var payload = {
        Event:'update',
        Type:'led',
        att:{value: state}
    };

    socket.send(JSON.stringify(payload));
}

//Motion sensor physically changed status --> change model animation
function recieveUpdate(sensor){
	//animate iff sensor is on
	if ('value' in sensor['att']) {

		if (!sensor['att']['value']) {
			updateLED(false); // // Turn LED off
			findObjectsById('motion_sensor_red_button').forEach(function(item) {
			        item.traverse(function (object) {
			            //object.setRGB(0,77,0);
			             object.visible = false;
			    });
			});
		}
		else {
			updateLED(true); // Turn LED on
			findObjectsById('motion_sensor_red_button').forEach(function(item) {
			        item.traverse(function (object) {
			            //object.setRGB(0,77,0);
			             object.visible = true;
			        });
			});
		}
	}
}

//sending a message to change fan repr -> server
function UpdateToServer(){
	console.log("Sending motion sensor update");
    

    //onUpdate(test_payload); //commentout
    //socket.send(JSON.stringify(test_payload));

} 


/*function updateMotionSensor(sensor){
	console.log("Updating motion sensor: "+ JSON.stringify(sensor));

	    var test_payload = {
        Event:'update',
        Type:'motionSensor',
        att:{on_off: motionSensorOn, value: 42}
    };
    socket.send(JSON.stringify(test_payload));
} 
*/
//make object invisible in webGL
function motionSensorVisible (bool) {
	//makeVisible('security-system_motion-detector', false)
	console.log("Dropping motion sensor");
    findObjectsById('security-system_motion-detector').forEach(function(item) {
    	item.traverse(function (object) {
        	object.visible = bool;
    	});
	});
}

listOBJ['motionSensor'] = {};
listOBJ['motionSensor']['add'] = addMotionSensor;
listOBJ['motionSensor']['update'] = recieveUpdate;
listOBJ['motionSensor']['sendUpdate'] = UpdateToServer;
listOBJ['motionSensor']['drop'] = motionSensorVisible;
