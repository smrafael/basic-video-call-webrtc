
// General vars
var local_ip = '192.168.130.51';
var port = ':3000'
var local_address = "http://"+local_ip+port;
var signaling_server_address = "ws://"+local_ip+port;
var call_token; // unique token for this call
var signaling_server; // signaling server for this call
var peer_connection; // peer connection object
var stun_server = "stun.l.google.com:19302";
var offerOptions = {
  offerToReceiveVideo: 1,
  offerToReceiveAudio: 0
};

function start() {
  // create the WebRTC peer connection object
  peer_connection = new RTCPeerConnection({ // RTCPeerConnection configuration
    "iceServers": [ // information about ice servers
      { "urls": "stun:"+stun_server }, // stun server info
    ]
  });

  // generic handler that sends any ice candidates to the other peer
  peer_connection.onicecandidate = function (ice_event) {
    if (ice_event.candidate) {
      signaling_server.send(
        JSON.stringify({
          token: call_token,
          type: "new_ice_candidate",
          candidate: ice_event.candidate ,
        })
      );
    }
  };

  // display remote video streams when they arrive using local <video> MediaElement
  peer_connection.ontrack = function (event) {
    log_comment("ontrack fired!");
    connect_stream_to_src(event.streams[0], document.getElementById("remote_video"));
    // hide placeholder and show remote video
    document.getElementById("loading_state").style.display = "none";
    document.getElementById("open_call_state").style.display = "block";
  };


  // setup generic connection to the signaling server using the WebSocket API

  if (document.location.hash === "" || document.location.hash === undefined) { // you are the Caller
    // setup stream from the local camera
    setup_video(setup_caller);
  } else { // you have a hash fragment so you must be the Callee
    // setup stream from the local camera
    setup_video(setup_callee);
  }

}
/* functions used above are defined below */

function setup_caller() {
  // create the unique token for this call
  var token = Date.now()+"-"+Math.round(Math.random()*10000);
  call_token = "#"+token;

  // set location.hash to the unique token for this call
  document.location.hash = token;

  signaling_server = new WebSocket(signaling_server_address);
  signaling_server.onopen = function() {
    // setup caller signal handler
    signaling_server.onmessage = caller_signal_handler;

    // tell the signaling server you have joined the call
    signaling_server.send(
      JSON.stringify({
        token:call_token,
        type:"join",
      })
    );
  }

  document.title = "You are the Caller";
  document.getElementById("loading_state").innerHTML = "Ready for a call...ask your friend to visit:<br/><br/>"+local_address+"/"+call_token;
}

function setup_callee() {
  // get the unique token for this call from location.hash
  call_token = document.location.hash;

  signaling_server = new WebSocket(signaling_server_address);
  signaling_server.onopen = function() {
    // setup caller signal handler
    signaling_server.onmessage = callee_signal_handler;

    // tell the signaling server you have joined the call
    signaling_server.send(
      JSON.stringify({
        token:call_token,
        type:"join",
      })
    );

    // let the caller know you have arrived so they can start the call
    signaling_server.send(
      JSON.stringify({
        token:call_token,
        type:"callee_arrived",
      })
    );
  }

  document.title = "You are the Callee";
  document.getElementById("loading_state").innerHTML = "One moment please...connecting your call...";
}

// handle signals as a caller
function caller_signal_handler(event) {
  var signal = JSON.parse(event.data);
  log_comment('onmessage caller fired: '+signal.type);
  if (signal.type === "callee_arrived") {
    peer_connection.createOffer(
      offerOptions
    ).then(
      new_description_created,
      log_error
    )
  } else if (signal.type === "new_ice_candidate") {
    peer_connection.addIceCandidate(
      new RTCIceCandidate(signal.candidate)
    );
  } else if (signal.type === "new_description") {
    peer_connection.setRemoteDescription(new RTCSessionDescription(signal.sdp))
    .then(onSetRemoteSuccess, log_error);
  } else {
    // extend with your own signal types here
  }
}

// handle signals as a callee
function callee_signal_handler(event) {
  var signal = JSON.parse(event.data);
  log_comment('onmessage callee fired: '+signal.type);
  if (signal.type === "new_ice_candidate") {
    peer_connection.addIceCandidate(
      new RTCIceCandidate(signal.candidate)
    );
  } else if (signal.type === "new_description") {
    peer_connection.setRemoteDescription(new RTCSessionDescription(signal.sdp))
    .then(
      function () {
        onSetRemoteSuccess();
        console.log(peer_connection.remoteDescription.type);
        if (peer_connection.remoteDescription.type == "offer") {
          peer_connection.createAnswer().then(new_description_created, log_error);
        }
      }, log_error);
    } else {
      // extend with your own signal types here
    }
  }

  // handler to process new descriptions
  function new_description_created(description) {
    peer_connection.setLocalDescription(description)
    .then(function () {
      onSetLocalSuccess();
      signaling_server.send(
        JSON.stringify({
          token:call_token,
          type:"new_description",
          sdp:description
        })
      );
    }, log_error);
  }

  // setup stream from the local camera
  function setup_video(onsucess) {
    console.log(navigator.mediaDevices);

    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: true
    })
    .then(function (local_stream) { // success callback
      // display preview from the local camera & microphone using local <video> MediaElement
      connect_stream_to_src(local_stream, document.getElementById("local_video"));
      // add local camera stream to peer_connection ready to be sent to the remote peer
      peer_connection.addStream(local_stream);
      onsucess();
    })
    .catch(function(e) {
      log_error(e);
    });
  }

  connect_stream_to_src = function(media_stream, media_element) {
    // https://www.w3.org/Bugs/Public/show_bug.cgi?id=21606
    media_element.srcObject = media_stream;
    media_element.play();
  };

  function log_comment(comment) {
    console.log((new Date())+" "+comment);
  }

  // generic error handler
  function log_error(error) {
    console.log(error);
  }

  function onSetLocalSuccess() {
    log_comment('setLocalDescription complete');
  }

  function onSetRemoteSuccess() {
    log_comment('setRemoteDescription complete');
  }
