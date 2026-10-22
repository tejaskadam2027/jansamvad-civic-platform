package com.jansamvad.service;

import com.jansamvad.dto.AuthResponse;
import com.jansamvad.dto.SignUpRequest;
import com.jansamvad.dto.UserResponse;
import com.jansamvad.entity.UserEntity;
import com.jansamvad.repository.UserRepository;
import com.jansamvad.security.JwtService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;

@Service
@Transactional
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    public AuthResponse signUp(SignUpRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new IllegalArgumentException("An account with this email already exists");
        }
        if (userRepository.existsByMobileNumber(request.getMobileNumber())) {
            throw new IllegalArgumentException("An account with this mobile number already exists");
        }

        UserEntity.Role requestedRole = parseRequestedRole(request.getRole());

        UserEntity user = new UserEntity();
        user.setFullName(request.getFullName());
        user.setEmail(request.getEmail());
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        user.setMobileNumber(request.getMobileNumber());
        user.setWard(request.getWard());

        // Citizens register and gain access immediately. Any other role creates a
        // pending access request that an ADMIN must approve. ADMIN can never be
        // requested from the public sign-up page.
        if (requestedRole == null || requestedRole == UserEntity.Role.CITIZEN) {
            user.setRole(UserEntity.Role.CITIZEN);
            user.setAccessStatus(UserEntity.AccessStatus.ACTIVE);
            user.setRequestedRole(null);
        } else {
            user.setRole(UserEntity.Role.CITIZEN);
            user.setAccessStatus(UserEntity.AccessStatus.PENDING);
            user.setRequestedRole(requestedRole);
        }

        UserEntity saved = userRepository.save(user);
        String token = jwtService.generateToken(saved.getId(), saved.getEmail(), saved.getRole().name());
        return toAuthResponse(saved, token);
    }

    public AuthResponse signIn(String email, String password) {
        UserEntity user = userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("Invalid email or password"));
        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            throw new IllegalArgumentException("Invalid email or password");
        }

        if (user.getAccessStatus() == UserEntity.AccessStatus.PENDING) {
            String requested = user.getRequestedRole() != null ? user.getRequestedRole().name() : "your requested role";
            throw new IllegalArgumentException(
                    "Your access request for " + requested + " is pending admin approval. " +
                    "You will be able to sign in once an administrator approves it.");
        }
        if (user.getAccessStatus() == UserEntity.AccessStatus.REJECTED) {
            throw new IllegalArgumentException(
                    "Your access request has been rejected. Please contact the administrator.");
        }

        String token = jwtService.generateToken(user.getId(), user.getEmail(), user.getRole().name());
        return toAuthResponse(user, token);
    }

    public UserResponse getCurrentUser(String email) {
        UserEntity user = userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        return toUserResponse(user);
    }

    private UserEntity.Role parseRequestedRole(String role) {
        if (role == null || role.isBlank()) return null;
        String normalized = role.trim().toUpperCase(Locale.ROOT);
        if (normalized.equals("CITIZEN")) return UserEntity.Role.CITIZEN;
        if (normalized.equals("MUNICIPAL_AUTHORITY")) return UserEntity.Role.MUNICIPAL_AUTHORITY;
        if (normalized.equals("FIELD_WORKFORCE")) return UserEntity.Role.FIELD_WORKFORCE;
        if (normalized.equals("INFLUENCER_REPORTER") || normalized.equals("INFLUENCER")) return UserEntity.Role.INFLUENCER_REPORTER;
        // ADMIN is intentionally NOT parseable from public sign-up.
        throw new IllegalArgumentException("Invalid role selection");
    }

    private AuthResponse toAuthResponse(UserEntity user, String token) {
        return new AuthResponse(
                token,
                String.valueOf(user.getId()),
                user.getFullName(),
                user.getEmail(),
                user.getRole().name(),
                user.getAccessStatus().name(),
                user.getRequestedRole() != null ? user.getRequestedRole().name() : null,
                user.getWard(),
                user.getDepartment(),
                user.getMobileNumber()
        );
    }

    private UserResponse toUserResponse(UserEntity user) {
        return new UserResponse(
                user.getId(),
                user.getFullName(),
                user.getEmail(),
                user.getMobileNumber(),
                user.getRole().name(),
                user.getAccessStatus().name(),
                user.getRequestedRole() != null ? user.getRequestedRole().name() : null,
                user.getWard(),
                user.getDepartment(),
                user.getCreatedAt()
        );
    }
}
