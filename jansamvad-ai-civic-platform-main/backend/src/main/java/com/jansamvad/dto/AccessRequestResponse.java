package com.jansamvad.dto;

import java.time.Instant;

public class AccessRequestResponse {
    private Long id;
    private String fullName;
    private String email;
    private String mobileNumber;
    private String currentRole;
    private String requestedRole;
    private String accessStatus;
    private Instant createdAt;

    public AccessRequestResponse() {}

    public AccessRequestResponse(Long id, String fullName, String email, String mobileNumber,
                                 String currentRole, String requestedRole, String accessStatus, Instant createdAt) {
        this.id = id;
        this.fullName = fullName;
        this.email = email;
        this.mobileNumber = mobileNumber;
        this.currentRole = currentRole;
        this.requestedRole = requestedRole;
        this.accessStatus = accessStatus;
        this.createdAt = createdAt;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getMobileNumber() { return mobileNumber; }
    public void setMobileNumber(String mobileNumber) { this.mobileNumber = mobileNumber; }
    public String getCurrentRole() { return currentRole; }
    public void setCurrentRole(String currentRole) { this.currentRole = currentRole; }
    public String getRequestedRole() { return requestedRole; }
    public void setRequestedRole(String requestedRole) { this.requestedRole = requestedRole; }
    public String getAccessStatus() { return accessStatus; }
    public void setAccessStatus(String accessStatus) { this.accessStatus = accessStatus; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
