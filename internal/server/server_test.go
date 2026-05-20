package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"fanar-app/internal/store"
)

func newTestServer(t *testing.T) *Server {
	t.Helper()
	s, err := store.New(":memory:")
	if err != nil {
		t.Fatalf("store.New: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return New(s)
}

func ingest(t *testing.T, srv *Server, p store.Payload) {
	t.Helper()
	body, _ := json.Marshal(p)
	r := httptest.NewRequest(http.MethodPost, "/api/payloads", bytes.NewReader(body))
	w := httptest.NewRecorder()
	srv.handleIngest(w, r)
	if w.Code != http.StatusCreated {
		t.Fatalf("ingest: want 201, got %d: %s", w.Code, w.Body)
	}
}

func TestHandleIngest(t *testing.T) {
	srv := newTestServer(t)
	body, _ := json.Marshal(store.Payload{ID: "x1", Type: "log", Timestamp: time.Now()})
	r := httptest.NewRequest(http.MethodPost, "/api/payloads", bytes.NewReader(body))
	w := httptest.NewRecorder()
	srv.handleIngest(w, r)
	if w.Code != http.StatusCreated {
		t.Errorf("want 201, got %d", w.Code)
	}
}

func TestHandleIngestGeneratesID(t *testing.T) {
	srv := newTestServer(t)
	ingest(t, srv, store.Payload{Type: "log", Timestamp: time.Now()})

	r2 := httptest.NewRequest(http.MethodGet, "/api/payloads", nil)
	w2 := httptest.NewRecorder()
	srv.handleList(w2, r2)

	var payloads []store.Payload
	if err := json.NewDecoder(w2.Body).Decode(&payloads); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(payloads) != 1 || payloads[0].ID == "" {
		t.Errorf("want 1 payload with generated ID, got %+v", payloads)
	}
}

func TestHandleIngestInvalidJSON(t *testing.T) {
	srv := newTestServer(t)
	r := httptest.NewRequest(http.MethodPost, "/api/payloads", bytes.NewBufferString("not json"))
	w := httptest.NewRecorder()
	srv.handleIngest(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", w.Code)
	}
}

func TestHandleIngestBodyTooLarge(t *testing.T) {
	srv := newTestServer(t)
	r := httptest.NewRequest(http.MethodPost, "/api/payloads", bytes.NewReader(make([]byte, 5<<20)))
	w := httptest.NewRecorder()
	srv.handleIngest(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", w.Code)
	}
}

func TestHandleList(t *testing.T) {
	srv := newTestServer(t)
	ingest(t, srv, store.Payload{ID: "a", Type: "test", Timestamp: time.Now()})
	ingest(t, srv, store.Payload{ID: "b", Type: "test", Timestamp: time.Now()})

	r := httptest.NewRequest(http.MethodGet, "/api/payloads", nil)
	w := httptest.NewRecorder()
	srv.handleList(w, r)

	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", w.Code)
	}
	var payloads []store.Payload
	if err := json.NewDecoder(w.Body).Decode(&payloads); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(payloads) != 2 {
		t.Errorf("want 2 payloads, got %d", len(payloads))
	}
}

func TestHandleClear(t *testing.T) {
	srv := newTestServer(t)
	ingest(t, srv, store.Payload{ID: "z", Type: "test", Timestamp: time.Now()})

	r := httptest.NewRequest(http.MethodDelete, "/api/payloads", nil)
	w := httptest.NewRecorder()
	srv.handleClear(w, r)
	if w.Code != http.StatusNoContent {
		t.Errorf("want 204, got %d", w.Code)
	}

	r2 := httptest.NewRequest(http.MethodGet, "/api/payloads", nil)
	w2 := httptest.NewRecorder()
	srv.handleList(w2, r2)
	var payloads []store.Payload
	if err := json.NewDecoder(w2.Body).Decode(&payloads); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(payloads) != 0 {
		t.Errorf("want 0 payloads after clear, got %d", len(payloads))
	}
}

func TestCORSHeaders(t *testing.T) {
	handler := cors(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	r := httptest.NewRequest(http.MethodGet, "/", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)

	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Errorf("want CORS origin *, got %q", got)
	}
}

func TestHandleIngestDuplicateID(t *testing.T) {
	srv := newTestServer(t)
	ingest(t, srv, store.Payload{ID: "dup", Type: "test", Timestamp: time.Now()})

	body, _ := json.Marshal(store.Payload{ID: "dup", Type: "test", Timestamp: time.Now()})
	r := httptest.NewRequest(http.MethodPost, "/api/payloads", bytes.NewReader(body))
	w := httptest.NewRecorder()
	srv.handleIngest(w, r)
	if w.Code != http.StatusInternalServerError {
		t.Errorf("want 500 on duplicate ID, got %d", w.Code)
	}
}

func TestHandleIngestSetsTimestamp(t *testing.T) {
	srv := newTestServer(t)
	ingest(t, srv, store.Payload{ID: "ts-test", Type: "log"}) // zero Timestamp

	r2 := httptest.NewRequest(http.MethodGet, "/api/payloads", nil)
	w2 := httptest.NewRecorder()
	srv.handleList(w2, r2)
	var payloads []store.Payload
	if err := json.NewDecoder(w2.Body).Decode(&payloads); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(payloads) != 1 || payloads[0].Timestamp.IsZero() {
		t.Errorf("want non-zero timestamp, got %v", payloads)
	}
}

func TestCORSPreflight(t *testing.T) {
	handler := cors(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK) // should not be reached
	}))

	r := httptest.NewRequest(http.MethodOptions, "/api/payloads", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)

	if w.Code != http.StatusNoContent {
		t.Errorf("want 204 for OPTIONS preflight, got %d", w.Code)
	}
}
