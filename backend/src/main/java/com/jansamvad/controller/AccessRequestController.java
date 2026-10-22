package com.jansamvad.controller;

import com.jansamvad.dto.AccessRequestResponse;
import com.jansamvad.service.AccessRequestService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin/access-requests")
public class AccessRequestController {

    private final AccessRequestService accessRequestService;

    public AccessRequestController(AccessRequestService accessRequestService) {
        this.accessRequestService = accessRequestService;
    }

    @GetMapping
    public ResponseEntity<List<AccessRequestResponse>> pendingRequests() {
        return ResponseEntity.ok(accessRequestService.getPendingRequests());
    }

    @PutMapping("/{userId}/approve")
    public ResponseEntity<AccessRequestResponse> approve(@PathVariable Long userId) {
        return ResponseEntity.ok(accessRequestService.approve(userId));
    }

    @PutMapping("/{userId}/reject")
    public ResponseEntity<AccessRequestResponse> reject(@PathVariable Long userId) {
        return ResponseEntity.ok(accessRequestService.reject(userId));
    }
}
