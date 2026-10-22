package com.jansamvad.security;

import com.jansamvad.entity.UserEntity;
import com.jansamvad.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class AdminBootstrap {

    private static final Logger log = LoggerFactory.getLogger(AdminBootstrap.class);

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${app.admin.bootstrap-email:}")
    private String bootstrapEmail;

    @Value("${app.admin.bootstrap-password:}")
    private String bootstrapPassword;

    @Value("${app.admin.bootstrap-name:Administrator}")
    private String bootstrapName;

    public AdminBootstrap(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void bootstrapAdmin() {
        if (bootstrapEmail == null || bootstrapEmail.isBlank()
                || bootstrapPassword == null || bootstrapPassword.isBlank()) {
            log.info("Admin bootstrap skipped — set APP_ADMIN_EMAIL and APP_ADMIN_PASSWORD to create the first administrator.");
            return;
        }

        userRepository.findByEmail(bootstrapEmail).ifPresentOrElse(
                existing -> {
                    if (existing.getRole() != UserEntity.Role.ADMIN) {
                        log.warn("Bootstrap email {} already exists with role {}. Not modifying.", bootstrapEmail, existing.getRole());
                    } else {
                        log.info("Administrator account already exists for {}.", bootstrapEmail);
                    }
                },
                () -> {
                    UserEntity admin = new UserEntity();
                    admin.setFullName(bootstrapName);
                    admin.setEmail(bootstrapEmail);
                    admin.setPasswordHash(passwordEncoder.encode(bootstrapPassword));
                    admin.setMobileNumber("0000000000");
                    admin.setRole(UserEntity.Role.ADMIN);
                    admin.setAccessStatus(UserEntity.AccessStatus.ACTIVE);
                    admin.setRequestedRole(null);
                    userRepository.save(admin);
                    log.info("First administrator account created for {} from bootstrap environment variables.", bootstrapEmail);
                }
        );
    }
}
