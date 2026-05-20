package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/rand/v2"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"fanar-app/internal/store"
)

type Server struct {
	store      *store.Store
	ctx        atomic.Pointer[context.Context]
	mu         sync.Mutex
	httpServer *http.Server
}

func New(s *store.Store) *Server {
	return &Server{store: s}
}

func (s *Server) SetContext(ctx context.Context) {
	s.ctx.Store(&ctx)
}

func (s *Server) Shutdown() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.httpServer != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = s.httpServer.Shutdown(ctx)
		s.httpServer = nil
	}
}

func (s *Server) Start(port int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	srv := s.newHTTPServer(port)
	s.httpServer = srv
	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("[fanar] server error: %v", err)
		}
	}()
}

func (s *Server) newHTTPServer(port int) *http.Server {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/payloads", s.handleIngest)
	mux.HandleFunc("DELETE /api/payloads", s.handleClear)
	mux.HandleFunc("GET /api/payloads", s.handleList)
	return &http.Server{
		Addr:         fmt.Sprintf(":%d", port),
		Handler:      cors(mux),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) getCtx() context.Context {
	if p := s.ctx.Load(); p != nil {
		return *p
	}
	return nil
}

func (s *Server) handleIngest(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 4<<20) // 4 MB cap
	var p store.Payload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if p.ID == "" {
		p.ID = fmt.Sprintf("%d-%016x", time.Now().UnixNano(), rand.Uint64())
	}
	if p.Timestamp.IsZero() {
		p.Timestamp = time.Now()
	}
	if err := s.store.Insert(p); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if ctx := s.getCtx(); ctx != nil {
		runtime.EventsEmit(ctx, "payload:new", p)
	}
	w.WriteHeader(http.StatusCreated)
}

func (s *Server) handleClear(w http.ResponseWriter, r *http.Request) {
	if err := s.store.Clear(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if ctx := s.getCtx(); ctx != nil {
		runtime.EventsEmit(ctx, "payload:cleared")
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleList(w http.ResponseWriter, r *http.Request) {
	payloads, err := s.store.List()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(payloads) //nolint:errcheck
}
