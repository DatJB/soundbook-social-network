package com.soundbook.service;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.soundbook.common.exception.AppException;
import com.soundbook.common.exception.ErrorCode;
import com.soundbook.dto.common.request.LoginRequest;
import com.soundbook.dto.common.request.RegisterRequest;
import com.soundbook.dto.common.response.AuthResponse;
import com.soundbook.entity.User;
import com.soundbook.entity.UserOnboarding;
import com.soundbook.entity.UserProfile;
import com.soundbook.entity.enums.ThemeMode;
import com.soundbook.entity.enums.UserRole;
import com.soundbook.entity.enums.UserStatus;
import com.soundbook.repository.UserOnboardingRepository;
import com.soundbook.repository.UserProfileRepository;
import com.soundbook.repository.UserRepository;
import com.soundbook.security.JwtService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final AuthenticationManager authenticationManager;
    private final UserDetailsService userDetailsService;
    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final UserProfileRepository userProfileRepository;
    private final UserOnboardingRepository userOnboardingRepository;
    private final TokenBlacklistService tokenBlacklistService;
    private final AuthSessionService authSessionService;

    @Value("${google.client-id:}")
    private String googleClientId;

    public AuthResponse login(LoginRequest request) {
        String email = normalizeEmail(request.getEmail());

        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new BadCredentialsException("Incorrect email or password"));

        if (user.getStatus().equals(UserStatus.DELETED))
        {
            throw new AppException(ErrorCode.USER_DELETED);
        }

        if (user.getStatus().equals(UserStatus.BANNED))
        {
            throw new AppException(ErrorCode.USER_BANNED);
        }

        System.out.println(user.getRole());

        if (user.getPasswordHash() == null || user.getPasswordHash().isBlank()) {
            throw new AppException(ErrorCode.USER_MOVED);
        }

        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(email, request.getPassword())
        );

        ensureUserIsNotAlreadyLoggedIn(email);

        return generateAuthResponse(user);
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        String email = normalizeEmail(request.getEmail());

        if (userRepository.existsByEmail(email)) {
            throw new AppException(ErrorCode.USER_EXISTED);
        }

        User user = User.builder()
                .email(email)
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .displayName(request.getDisplayName() == null ? null : request.getDisplayName().trim())
                .role(UserRole.USER)
                .status(UserStatus.ACTIVE)
                .build();

        user = userRepository.save(user);
        createDefaultProfileAndOnboarding(user, null);

        return generateAuthResponse(user);
    }

    @Transactional
    public AuthResponse loginWithGoogle(String idTokenString) {
        try {
            if (idTokenString == null || idTokenString.isBlank()) {
                throw new RuntimeException("Google idToken bị thiếu.");
            }

            if (googleClientId == null || googleClientId.trim().isEmpty()) {
                throw new RuntimeException("Cấu hình google.client-id bị thiếu ở Backend.");
            }

            GoogleIdTokenVerifier verifier = new GoogleIdTokenVerifier.Builder(
                    new NetHttpTransport(),
                    new GsonFactory()
            )
                    .setAudience(Collections.singletonList(googleClientId))
                    .build();

            GoogleIdToken idToken = verifier.verify(idTokenString);
            if (idToken == null) {
                throw new RuntimeException("Xác thực Google với server Google thất bại!");
            }

            GoogleIdToken.Payload payload = idToken.getPayload();
            String email = normalizeEmail(payload.getEmail());
            String googleSub = payload.getSubject();
            String name = (String) payload.get("name");
            String pictureUrl = (String) payload.get("picture");

            User user = userRepository.findByEmail(email).map(existingUser -> {
                if (existingUser.getStatus().equals(UserStatus.DELETED))
                {
                    throw new AppException(ErrorCode.USER_DELETED);
                }

                if (existingUser.getStatus().equals(UserStatus.BANNED))
                {
                    throw new AppException(ErrorCode.USER_BANNED);
                }

                boolean changed = false;

                if ((existingUser.getGoogleSub() == null || existingUser.getGoogleSub().isBlank())
                        && googleSub != null && !googleSub.isBlank()) {
                    existingUser.setGoogleSub(googleSub);
                    changed = true;
                }

                if ((existingUser.getDisplayName() == null || existingUser.getDisplayName().isBlank())
                        && name != null && !name.isBlank()) {
                    existingUser.setDisplayName(name);
                    changed = true;
                }

                return changed ? userRepository.save(existingUser) : existingUser;
            }).orElseGet(() -> {
                User newUser = User.builder()
                        .email(email)
                        .googleSub(googleSub)
                        .displayName(name != null && !name.isBlank() ? name : email)
                        .role(UserRole.USER)
                        .status(UserStatus.ACTIVE)
                        .build();

                User savedUser = userRepository.save(newUser);
                createDefaultProfileAndOnboarding(savedUser, pictureUrl);
                return savedUser;
            });

            ensureUserIsNotAlreadyLoggedIn(email);

            return generateAuthResponse(user);
        } catch (AppException exception) {
            exception.printStackTrace();
            throw exception;
        } catch (Exception exception) {
            exception.printStackTrace();
            throw new AppException(ErrorCode.UNAUTHENTICATED);
        }
    }

    public void logout(String email, String authorizationHeader) {
        try {
            if (email == null || email.isBlank()) {
                throw new AppException(ErrorCode.UNAUTHENTICATED);
            }

            if (authorizationHeader == null || !authorizationHeader.startsWith("Bearer ")) {
                throw new AppException(ErrorCode.UNAUTHENTICATED);
            }

            String token = authorizationHeader.substring(7).trim();
            if (token.isEmpty() || tokenBlacklistService.isBlacklisted(token)) {
                throw new AppException(ErrorCode.UNAUTHENTICATED);
            }

            String tokenEmail = jwtService.extractUsername(token);
            if (tokenEmail == null || !email.equals(tokenEmail)) {
                throw new AppException(ErrorCode.UNAUTHENTICATED);
            }

            tokenBlacklistService.blacklistToken(token, jwtService.extractExpiration(token));
            authSessionService.removeSession(tokenEmail, token);
        } catch (AppException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new AppException(ErrorCode.UNAUTHENTICATED);
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    private AuthResponse generateAuthResponse(User user) {
        UserDetails userDetails = userDetailsService.loadUserByUsername(user.getEmail());
        String jwtToken = jwtService.generateToken(userDetails);
        authSessionService.saveSession(user.getEmail(), jwtToken, jwtService.extractExpiration(jwtToken));

        Optional<UserProfile> profileOpt = userProfileRepository.findById(user.getId());

        return AuthResponse.builder()
                .token(jwtToken)
                .userId(user.getId())
                .email(user.getEmail())
                .displayName(user.getDisplayName())
                .role(user.getRole().name())
                .avatarUrl(profileOpt.map(UserProfile::getAvatarUrl).orElse(null))
                .username(profileOpt.map(UserProfile::getUsername).orElse(null))
                .onboardingCompleted(userOnboardingRepository.findById(user.getId())
                        .map(onboarding -> Boolean.TRUE.equals(onboarding.getTasteDnaReady()))
                        .orElse(false))
                .build();
    }

    private void ensureUserIsNotAlreadyLoggedIn(String email) {
        if (authSessionService.hasActiveSession(email)) {
            throw new AppException(ErrorCode.ALREADY_LOGGED_IN);
        }
    }

    private void createDefaultProfileAndOnboarding(User user, String avatarUrl) {
        String baseUsername = user.getEmail().split("@")[0].replaceAll("[^a-zA-Z0-9]", "");
        String uniqueUsername = (baseUsername.isBlank() ? "user" : baseUsername)
                + "_"
                + UUID.randomUUID().toString().substring(0, 5);

        UserProfile profile = UserProfile.builder()
                .user(user)
                .username(uniqueUsername)
                .avatarUrl(avatarUrl)
                .themeMode(ThemeMode.AUTO)
                .allowPreviewPlayer(true)
                .build();
        userProfileRepository.save(profile);

        UserOnboarding onboarding = UserOnboarding.builder()
                .user(user)
                .musicConnected(false)
                .musicDnaReady(false)
                .bookDnaReady(false)
                .tasteDnaReady(false)
                .build();
        userOnboardingRepository.save(onboarding);
    }

    private String normalizeEmail(String email) {
        return email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }
}