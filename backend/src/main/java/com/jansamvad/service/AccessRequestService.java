package com.jansamvad.service;

import com.jansamvad.dto.AccessRequestResponse;
import com.jansamvad.entity.UserEntity;
import com.jansamvad.repository.UserRepository;
import com.jansamvad.security.SecurityUtils;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
@Transactional
public class AccessRequestService {

    private final UserRepository userRepository;
    private final SecurityUtils securityUtils;

    public AccessRequestService(UserRepository userRepository, SecurityUtils securityUtils) {
        this.userRepository = userRepository;
        this.securityUtils = securityUtils;
    }

    public List<AccessRequestResponse> getPendingRequests() {
        ensureAdmin();
        return userRepository.findByAccessStatus(UserEntity.AccessStatus.PENDING).stream()
                .map(this::toResponse)
                .toList();
    }

    public AccessRequestResponse approve(Long userId) {
        UserEntity admin = ensureAdmin();
        UserEntity user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        if (user.getAccessStatus() != UserEntity.AccessStatus.PENDING) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This request is not pending");
        }
        if (user.getRequestedRole() == null || user.getRequestedRole() == UserEntity.Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid requested role");
        }

        user.setRole(user.getRequestedRole());
        user.setAccessStatus(UserEntity.AccessStatus.ACTIVE);
        user.setRequestedRole(null);
        UserEntity saved = userRepository.save(user);
        return toResponse(saved);
    }

    public AccessRequestResponse reject(Long userId) {
        ensureAdmin();
        UserEntity user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        if (user.getAccessStatus() != UserEntity.AccessStatus.PENDING) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This request is not pending");
        }

        user.setAccessStatus(UserEntity.AccessStatus.REJECTED);
        user.setRequestedRole(null);
        UserEntity saved = userRepository.save(user);
        return toResponse(saved);
    }

    private UserEntity ensureAdmin() {
        UserEntity current = securityUtils.getCurrentUser();
        if (current.getRole() != UserEntity.Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Administrator access required");
        }
        return current;
    }

    private AccessRequestResponse toResponse(UserEntity user) {
        return new AccessRequestResponse(
                user.getId(),
                user.getFullName(),
                user.getEmail(),
                user.getMobileNumber(),
                user.getRole().name(),
                user.getRequestedRole() != null ? user.getRequestedRole().name() : null,
                user.getAccessStatus().name(),
                user.getCreatedAt()
        );
    }
}
