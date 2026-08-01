package net

// Copyright 2013 The Gorilla WebSocket Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

import (
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

// serveWs handles websocket requests from the peer.
func serveWs(h func(*Client), upgrader *websocket.Upgrader, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}
	client := &Client{
		conn:               conn,
		onConnectedHandler: h,
		send:               make(chan []byte, 256),
		receive:            make(chan []byte, 256),
		connQuit:           make(chan struct{}, 1),
		chanQuit:           make(chan struct{}, 1),
	}
	client.Run()
}

// NewHandleFunc returns a http.HandleFunc that accepts new ws clients and
// registers them with the hub.
//
// checkOrigin decides which pages may open a socket. ⚑ IT IS A REQUIRED
// ARGUMENT, and it used to be `return true` for every origin — correct while the
// game carried no credentials, and a Cross-Site WebSocket Hijacking hole the
// moment step 8a set a session cookie: WebSocket handshakes are NOT subject to
// CORS, so nothing else intervenes, and the browser attaches the victim's cookie
// to a handshake any website can start (backlog §43.1).
//
// ⚑ It is passed IN rather than built here so that one allowlist serves both
// this and the CORS headers on /api (pkg/aura/origins). A second copy of the
// list is a copy that eventually disagrees — and this package deliberately keeps
// no dependency on the HTTP API to get it.
func NewHandleFunc(h func(*Client), checkOrigin func(*http.Request) bool) http.HandlerFunc {
	if checkOrigin == nil {
		panic("net: the websocket handler needs an origin check")
	}
	upgrader := &websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin:     checkOrigin,
	}
	return func(w http.ResponseWriter, r *http.Request) {
		serveWs(h, upgrader, w, r)
	}
}
