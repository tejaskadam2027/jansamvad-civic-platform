package com.jansamvad.dto;

public class AuthResponse {
    private String token;
    private String userId;
    private String fullName;
    private String email;
    private String role;
    private String accessStatus;
    private String requestedRole;
    private String ward;
    private String department;
    private String mobileNumber;

    public AuthResponse(String token, String userId, String fullName, String email, String role, String accessStatus, String requestedRole, String ward, String department, String mobileNumber) {
        this.token = token;
        this.userId = userId;
        this.fullName = fullName;
        this.email = email;
        this.role = role;
        this.accessStatus = accessStatus;
        this.requestedRole = requestedRole;
        this.ward = ward;
        this.department = department;
        this.mobileNumber = mobileNumber;
    }

    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
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
    public String getMobileNumber() { return mobileNumber; }
    public void setMobileNumber(String mobileNumber) { this.mobileNumber = mobileNumber; }
}
