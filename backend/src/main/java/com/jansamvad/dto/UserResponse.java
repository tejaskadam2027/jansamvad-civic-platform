package com.jansamvad.dto;

import java.time.Instant;

public class UserResponse {
    private Long id;
    private String fullName;
    private String email;
    private String mobileNumber;
    private String role;
    private String accessStatus;
    private String requestedRole;
    private String ward;
    private String department;
    private Instant createdAt;

    public UserResponse() {}

    public UserResponse(Long id, String fullName, String email, String mobileNumber, String role, String accessStatus, String requestedRole, String ward, String department, Instant createdAt) {
        this.id = id;
        this.fullName = fullName;
        this.email = email;
        this.mobileNumber = mobileNumber;
        this.role = role;
        this.accessStatus = accessStatus;
        this.requestedRole = requestedRole;
        this.ward = ward;
        this.department = department;
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
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public String getAccessStatus() { return accessStatus; }
    public void setAccessStatus(String accessStatus) { this.accessStatus = accessStatus; }
    public String getRequestedRole() { return requestedRole; }
    public void setRequestedRole(String requestedRole) { this.requestedRole = requestedRole; }
    public String getWard() { return ward; }
    public void setWard(String ward) { this.ward = ward; }
    public String getDepartment() { return department; }
    public void setDepartment(String department) { this.department = department; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
